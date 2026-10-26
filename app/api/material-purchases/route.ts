import { businessFeatureDenied } from '@/lib/business/feature-access';
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { MaterialError, readPurchase, text } from "@/lib/material-purchases/input";
import { getMaterialSnapshot } from "@/lib/material-purchases/snapshot";
import { saveMaterialPurchase, actOnPurchase } from "@/lib/material-purchases/store";
import { readPurchaseForm, PurchaseFormError } from "@/lib/purchases/read-purchase-form";
import { uploadProductImage, removeUncommittedProductImages, ProductImageError } from "@/lib/purchases/product-images";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function context() {
    const user=await getCurrentUser();if(!user)throw new MaterialError("გაიარე ავტორიზაცია.",401);
    const member=await getCurrentBusiness();if(!member)throw new MaterialError("ბიზნესი ვერ მოიძებნა.",403);
    return {userId:user.id,businessId:member.businessId};
}
function failure(e:unknown) {
    if(e instanceof MaterialError||e instanceof PurchaseFormError)return json({error:e.message},e.status);
    if(e instanceof ProductImageError)return json({error:e.message},422);
    if(e&&typeof e==='object'&&'code' in e&&e.code==='P2034')return json({error:"პარტია შეიცვალა. სცადე ხელახლა."},409);
    console.error('Material purchase failed',e instanceof Error?e.name:'Unknown');
    return json({error:"შენახვის შედეგი ვერ დადასტურდა. სცადე ხელახლა იმავე ფორმიდან."},500);
}
export async function GET(request:Request) {
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;

    try {const c=await context();return json(await getMaterialSnapshot(c.businessId,Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}
}
async function smallJson(request:Request) {
    const reader=request.body?.getReader();if(!reader)throw new MaterialError('მოთხოვნა ცარიელია.',400);
    const chunks:Uint8Array[]=[];let length=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2000){await reader.cancel();throw new MaterialError('მოთხოვნა ზედმეტად დიდია.',413);}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const result:unknown=JSON.parse(new TextDecoder().decode(bytes));
    if(!result||typeof result!=='object'||Array.isArray(result))throw new MaterialError('მოთხოვნა არასწორია.',400);
    return result as Record<string,unknown>;
}
export async function POST(request:Request) {
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;

    if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'მოთხოვნის წყარო დაუშვებელია.'},403);
    const db=createPrismaClient();
    const uploaded:{path:string;url:string}[]=[];
    let businessId='';
    // Cleanup checks committed references as well, so an uncertain DB response cannot delete a saved photo.
    async function cleanUnused() {
        if(!uploaded.length)return;
        const used=await db.material.findMany({where:{businessId,imageUrl:{in:uploaded.map(u=>u.url)}},select:{imageUrl:true}});
        await removeUncommittedProductImages(businessId,uploaded.filter(u=>!used.some(m=>m.imageUrl===u.url)).map(u=>u.path));
    }
    try {
        const c=await context();businessId=c.businessId;
        const member=await db.businessMembership.findUnique({where:{userId_businessId:{userId:c.userId,businessId}}});
        if(!member||!['OWNER','ADMIN'].includes(member.role))throw new MaterialError('პარტიის მართვის უფლება არ გაქვს.',403);
        if(request.headers.get('content-type')?.startsWith('application/json')) {
            const action=await smallJson(request);
            if(action.action!=='receive'&&action.action!=='delete')throw new MaterialError('მოქმედება არასწორია.');
            const kind=action.action;
            await db.$transaction(tx=>actOnPurchase(tx,businessId,c.userId,text(action.id,100,true),text(action.version,40,true),kind,text(action.requestId,100,true)),{isolationLevel:'Serializable',timeout:20000});
        } else {
            const {payload,purchase,imageChanges}=await readPurchaseForm(request);
            const input=readPurchase({...purchase,requestId:payload.requestId});
            const edit=payload.id?{id:text(payload.id,100,true),version:text(payload.version,40,true)}:undefined;
            const images=new Map<number,string>();
            for(let index=0;index<imageChanges.length;index++) {
                const image=imageChanges[index];
                if(image.action==='upload') {
                    if(input.items[index].materialId)throw new MaterialError('არსებული მასალის ფოტოს შეცვლა ამ ფორმიდან დაუშვებელია.');
                    const result=await uploadProductImage(businessId,image.file,image.thumbnail);uploaded.push(result);images.set(index,result.url);
                }
            }
            await db.$transaction(tx=>saveMaterialPurchase(tx,businessId,c.userId,input,images,edit),{isolationLevel:'Serializable',timeout:20000});
            try{await cleanUnused();}catch{console.error('Material image cleanup pending');}
        }
        return json({success:true});
    } catch(e) {
        try{await cleanUnused();}catch{console.error('Material image cleanup requires verification');}
        if(e instanceof SyntaxError)return json({error:'მოთხოვნის მონაცემები არასწორია.'},400);
        return failure(e);
    } finally {await db.$disconnect();}
}
