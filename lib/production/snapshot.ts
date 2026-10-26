import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { createPrismaClient } from '@/lib/prisma';
export const productionInclude={inputs:true,outputs:{where:{active:true}}} as const;
export type ProductionRecord={id:string;number:number;name:string|null;productionDate:string;status:'IN_PROGRESS'|'COMPLETED';note:string|null;overheadCost:string;additionalCosts:Array<{name:string;amount:string}>;materialsCost:string;totalCost:string;updatedAt:string;inputs:Array<{id:string;materialId:string;name:string;unit:string;quantity:string;totalCost:string}>;outputs:Array<{id:string;rowKey:string;inventoryItemId:string|null;stockLotId:string|null;name:string;category:string|null;brand:string|null;description:string|null;color:string|null;size:string|null;imageUrl:string|null;quantity:number;costShare:string;totalCost:string;salePrice:string|null}>};
export type ProductionSnapshot={records:ProductionRecord[];q:string;status:string;page:number;pages:number;count:number;inProgress:number;completed:number;canWrite:boolean};
export async function getProductionSnapshot(businessId:string,params:Record<string,string|string[]|undefined>,userId:string){
    const q=typeof params.q==='string'?params.q.trim().slice(0,150):'',status=params.status==='IN_PROGRESS'||params.status==='COMPLETED'?params.status:'';
    const requested=typeof params.page==='string'&&/^\d{1,8}$/.test(params.page)?Math.max(1,Number(params.page)):1;
    const db=createPrismaClient();try{return await db.$transaction(async tx=>{
        const where:Prisma.ProductionWhereInput={businessId,...(status?{status}:{}),...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{inputs:{some:{name:{contains:q,mode:'insensitive'}}}},{outputs:{some:{active:true,name:{contains:q,mode:'insensitive'}}}},...(/^#?\d{1,8}$/.test(q)?[{number:Number(q.replace('#',''))}]:[])]}:{})};
        const membership=await tx.businessMembership.findUnique({where:{userId_businessId:{userId,businessId}}});
        const canWrite=!!membership&&['OWNER','ADMIN'].includes(membership.role);
        const count=await tx.production.count({where}),pages=Math.max(1,Math.ceil(count/10)),page=Math.min(requested,pages);
        const [records,inProgress,completed]=await Promise.all([tx.production.findMany({where,include:productionInclude,orderBy:[{productionDate:'desc'},{id:'desc'}],skip:(page-1)*10,take:10}),tx.production.count({where:{businessId,status:'IN_PROGRESS'}}),tx.production.count({where:{businessId,status:'COMPLETED'}})]);
        return JSON.parse(JSON.stringify({records,q,status,page,pages,count,inProgress,completed,canWrite})) as ProductionSnapshot;
    },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:20000});}finally{await db.$disconnect();}
}
export type ProductionOptions={materials:Array<{id:string;name:string;color:string|null;size:string|null;unit:string;currentStock:string;lots:Array<{id:string;remainingQuantity:string;defectiveQuantity:string;remainingCost:string}>}>;products:Array<{id:string;name:string;color:string|null;size:string|null;imageUrl:string|null;category:string|null;brand:string|null;description:string|null;salePrice:string|null}>;materialsTruncated:boolean;productsTruncated:boolean};
export async function getProductionOptions(businessId:string,q:string,id?:string){
    const db=createPrismaClient();try{return await db.$transaction(async tx=>{
        const old=id?await tx.production.findFirst({where:{id,businessId},include:{inputs:{include:{allocations:true}},outputs:{where:{active:true}}}}):null;
        const oldIds=old?.inputs.map(i=>i.materialId)??[];
        const materials=await tx.material.findMany({where:{businessId,AND:[{OR:[{currentStock:{gt:0}},{id:{in:oldIds}}]},...(q?[{OR:[{id:{in:oldIds}},...['name','color','size'].map(key=>({[key]:{contains:q,mode:'insensitive'}}))]}]:[])]},orderBy:[{name:'asc'},{id:'asc'}],take:51,include:{purchaseItems:{where:{purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}},orderBy:[{purchase:{purchaseDate:'asc'}},{id:'asc'}],select:{id:true,remainingQuantity:true,defectiveQuantity:true,remainingCost:true}}}});
        // An edited production may reuse the quantities it already consumed, without double-counting global stock.
        const missing=oldIds.filter(id=>!materials.slice(0,50).some(m=>m.id===id));
        const reserved=missing.length?await tx.material.findMany({where:{businessId,id:{in:missing}},include:{purchaseItems:{where:{purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}},orderBy:[{purchase:{purchaseDate:'asc'}},{id:'asc'}],select:{id:true,remainingQuantity:true,defectiveQuantity:true,remainingCost:true}}}}):[];
        const options=[...materials.slice(0,50),...reserved].map(m=>{const own=old?.inputs.find(i=>i.materialId===m.id);return {id:m.id,name:m.name,color:m.color,size:m.size,unit:m.unit,currentStock:m.currentStock.plus(own?.quantity??0),lots:m.purchaseItems.map(l=>{const a=own?.allocations.filter(a=>a.purchaseItemId===l.id)??[];return {...l,remainingQuantity:l.remainingQuantity.plus(a.reduce((s,a)=>s.plus(a.quantity),new Prisma.Decimal(0))),remainingCost:l.remainingCost.plus(a.reduce((s,a)=>s.plus(a.totalCost),new Prisma.Decimal(0)))};})};});
        const products=await tx.inventoryItem.findMany({where:{businessId,isActive:true,product:{businessId},...(q?{OR:[{product:{name:{contains:q,mode:'insensitive'}}},{color:{contains:q,mode:'insensitive'}},{size:{contains:q,mode:'insensitive'}}]}:{})},include:{product:true},orderBy:[{product:{name:'asc'}},{id:'asc'}],take:51});
        return JSON.parse(JSON.stringify({materials:options,materialsTruncated:materials.length>50,products:products.slice(0,50).map(i=>({id:i.id,name:i.product.name,category:i.product.category,brand:i.product.brand,description:i.product.description,color:i.color,size:i.size,imageUrl:i.imageUrl,salePrice:i.salePrice})),productsTruncated:products.length>50})) as ProductionOptions;
    },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:20000});}finally{await db.$disconnect();}
}
