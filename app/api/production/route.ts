import { businessFeatureDenied } from '@/lib/business/feature-access';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { createPrismaClient } from '@/lib/prisma';
import { readProduction, ProductionError } from '@/lib/production/input';
import { saveProduction } from '@/lib/production/store';
import { getProductionSnapshot } from '@/lib/production/snapshot';
import { readPurchaseForm, PurchaseFormError } from '@/lib/purchases/read-purchase-form';
import { uploadProductImage, removeUncommittedProductImages, ProductImageError } from '@/lib/purchases/product-images';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;
try{const user=await getCurrentUser();if(!user)return json({error:'გაიარე ავტორიზაცია.'},401);const member=await getCurrentBusiness();if(!member)return json({error:'ბიზნესი ვერ მოიძებნა.'},403);return json(await getProductionSnapshot(member.businessId,Object.fromEntries(new URL(request.url).searchParams),user.id));}catch(e){console.error('Production read failed',e instanceof Error?e.name:'Unknown');return json({error:'წარმოებები ვერ ჩაიტვირთა. სცადე ხელახლა.'},500);}}
export async function POST(request:Request){
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;

    if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'მოთხოვნის წყარო დაუშვებელია.'},403);
    const user=await getCurrentUser();if(!user)return json({error:'გაიარე ავტორიზაცია.'},401);
    const member=await getCurrentBusiness();if(!member)return json({error:'წარმოების მართვის უფლება არ გაქვს.'},403);
    const db=createPrismaClient(),uploaded:{path:string;url:string}[]=[];
    async function cleanup(){if(!uploaded.length)return;const urls=uploaded.map(i=>i.url);const [outputs,inventory]=await Promise.all([db.productionOutput.findMany({where:{production:{businessId:member!.businessId},imageUrl:{in:urls}},select:{imageUrl:true}}),db.inventoryItem.findMany({where:{businessId:member!.businessId,imageUrl:{in:urls}},select:{imageUrl:true}})]);await removeUncommittedProductImages(member!.businessId,uploaded.filter(u=>![...outputs,...inventory].some(i=>i.imageUrl===u.url)).map(u=>u.path));}
    try{
        const fresh=await db.businessMembership.findUnique({where:{userId_businessId:{userId:user.id,businessId:member.businessId}}});if(!fresh||!['OWNER','ADMIN'].includes(fresh.role))throw new ProductionError('წარმოების მართვის უფლება არ გაქვს.',403);
        const {payload,purchase,imageChanges}=await readPurchaseForm(request),input=readProduction({...purchase,requestId:payload.requestId,id:payload.id,version:payload.version});
        if(imageChanges.length!==Math.max(1,input.outputs.length))throw new ProductionError('ფოტოების რაოდენობა არასწორია.');
        const images=new Map<string,string>(),removed=new Set<string>();
        for(let index=0;index<imageChanges.length;index++){const image=imageChanges[index],output=input.outputs[index];if(!output){if(image.action!=='keep')throw new ProductionError('პროდუქტის გარეშე ფოტო ვერ აიტვირთება.');continue;}if(image.action==='remove')removed.add(output.rowKey);if(image.action==='upload'){if(output.inventoryItemId)throw new ProductionError('მარაგიდან არჩეული პროდუქტის ფოტო ამ ფორმიდან არ იცვლება.');const photo=await uploadProductImage(member.businessId,image.file,image.thumbnail);uploaded.push(photo);images.set(output.rowKey,photo.url);}}
        const result=await db.$transaction(tx=>saveProduction(tx,member.businessId,user.id,input,images,removed),{isolationLevel:'Serializable',maxWait:10000,timeout:30000});
        try{await cleanup();}catch{console.error('Production photo cleanup requires verification');}return json({success:true,...result});
    }catch(e){try{await cleanup();}catch{console.error('Production photo cleanup requires verification');}
        if(e instanceof ProductionError||e instanceof PurchaseFormError)return json({error:e.message},e.status);
        if(e instanceof ProductImageError)return json({error:e.message},422);
        if(e instanceof SyntaxError)return json({error:'მოთხოვნის ფორმატი არასწორია.'},400);
        if(e&&typeof e==='object'&&'code' in e&&e.code==='P2034')return json({error:'ნაშთი პარალელურად შეიცვალა. სცადე შენახვა ხელახლა.'},409);
        console.error('Production save failed',e instanceof Error?e.name:'Unknown');return json({error:'შენახვის შედეგი ვერ დადასტურდა. ფორმა შეინახე გახსნილი და სცადე ხელახლა.'},500);
    }finally{await db.$disconnect();}
}
