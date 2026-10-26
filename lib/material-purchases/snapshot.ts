import "server-only";
import { createPrismaClient } from "@/lib/prisma";
import { validDate } from "./input";
import type { Prisma } from "@/generated/prisma/client";
export async function getMaterialSnapshot(businessId:string,params:Record<string,string|string[]|undefined>) {
    const q=typeof params.q==='string'?params.q.trim().slice(0,150):'';
    const from=typeof params.from==='string'?params.from:'',to=typeof params.to==='string'?params.to:'';
    const error=(from&&!validDate(from))||(to&&!validDate(to))?'მიუთითე სწორი თარიღი.':from&&to&&from>to?'საწყისი თარიღი საბოლოოზე გვიან არ უნდა იყოს.':'';
    const requestedPage=typeof params.page==='string'&&/^\d{1,8}$/.test(params.page)?Math.max(1,Number(params.page)):1;
    const db=createPrismaClient();
    try {return await db.$transaction(async tx=>{
        const where:Prisma.MaterialPurchaseWhereInput={businessId,deletedAt:null};
        if(error)where.id={in:[]};
        if(q) {const n=Number(q.replace(/^#/,''));where.OR=[{name:{contains:q,mode:'insensitive'}},{items:{some:{name:{contains:q,mode:'insensitive'}}}},...(Number.isSafeInteger(n)&&n>0&&n<=2147483647?[{number:n}]:[])];}
        if(!error&&(from||to))where.purchaseDate={...(from?{gte:new Date(`${from}T00:00:00+04:00`)}:{}),...(to?{lt:new Date(new Date(`${to}T00:00:00+04:00`).getTime()+86400000)}:{})};
        const count=await tx.materialPurchase.count({where}),pages=Math.max(1,Math.ceil(count/10)),page=Math.min(requestedPage,pages);
        const purchases=await tx.materialPurchase.findMany({where,orderBy:[{purchaseDate:'desc'},{id:'desc'}],skip:(page-1)*10,take:10,include:{items:true}});
        const countries=(await tx.materialPurchase.findMany({where:{businessId,country:{not:null}},distinct:['country'],select:{country:true},orderBy:{country:'asc'}})).flatMap(p=>p.country?[p.country]:[]);
        const materials=await tx.material.findMany({where:{businessId},orderBy:[{name:'asc'},{id:'asc'}],take:51});
        // Decimal is serialized as a string; do not leak Prisma objects into React props.
        return JSON.parse(JSON.stringify({purchases,countries,materials:materials.slice(0,50),materialsTruncated:materials.length>50,count,page,pages,q,from,to,error})) as MaterialSnapshot;
    },{isolationLevel:'RepeatableRead'});} finally {await db.$disconnect();}
}
export type MaterialOption={id:string;name:string;brand:string|null;category:string|null;description:string|null;color:string|null;size:string|null;characteristics:string|null;unit:string;imageUrl:string|null;currentStock:string};
export type MaterialLine={id:string;materialId:string;name:string;snapshot:Record<string,string>;quantity:string;defectiveQuantity:string;unitPurchasePrice:string;totalCost:string;finalUnitCost:string};
export type MaterialBatch={id:string;number:number;name:string|null;country:string|null;purchaseDate:string;updatedAt:string;receiptStatus:'RECEIVED'|'IN_TRANSIT';shippingCost:string;customsCost:string;otherCost:string;note:string|null;items:MaterialLine[]};
export type MaterialSnapshot={purchases:MaterialBatch[];countries:string[];materials:MaterialOption[];materialsTruncated:boolean;count:number;page:number;pages:number;q:string;from:string;to:string;error:string};
