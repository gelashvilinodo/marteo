import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { createPrismaClient } from '@/lib/prisma';

type Params = Record<string,string|string[]|undefined>;
const value=(p:Params,key:string)=>typeof p[key]==='string'?(p[key] as string).trim():'';
const pageNumber=(s:string)=>/^\d{1,8}$/.test(s)?Math.max(1,Number(s)):1;
export async function getMaterialInventoryPage(businessId:string,params:Params){
    const db=createPrismaClient();
    try{return await db.$transaction(tx=>readMaterialInventoryPage(tx,businessId,params),{isolationLevel:'RepeatableRead',maxWait:10000,timeout:20000});}finally{await db.$disconnect();}
}
export async function readMaterialInventoryPage(tx:Prisma.TransactionClient,businessId:string,params:Params,pageSize=20){
    const q=value(params,'q').slice(0,150),filter=['available','exhausted','transit','defective'].includes(value(params,'filter'))?value(params,'filter'):'all';
    const sort=value(params,'sort')==='newest'?'newest':'name';

        // Materials from removed batches are retained for history, but are not live inventory entries.
        const active:Prisma.MaterialWhereInput={businessId,purchaseItems:{some:{purchase:{businessId,deletedAt:null}}}};
        const exhaustedWhere:Prisma.MaterialWhereInput={currentStock:{lte:0},purchaseItems:{some:{purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}}}};
        const transit:Prisma.MaterialPurchaseItemWhereInput={purchase:{businessId,deletedAt:null,receiptStatus:'IN_TRANSIT'}};
        const defective:Prisma.MaterialPurchaseItemWhereInput={remainingQuantity:{gt:0},defectiveQuantity:{gt:0},purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}};
        const where:Prisma.MaterialWhereInput={AND:[active,
            ...(q?[{OR:['name','brand','category','color','size','characteristics'].map(key=>({[key]:{contains:q,mode:'insensitive'}}))} as Prisma.MaterialWhereInput]:[]),
            ...(filter==='available'?[{currentStock:{gt:0}}]:filter==='exhausted'?[exhaustedWhere]:filter==='transit'?[{purchaseItems:{some:transit}}]:filter==='defective'?[{purchaseItems:{some:defective}}]:[])
        ]};
        const [count,all,available,exhausted,inTransit,withDefects]=await Promise.all([
            tx.material.count({where}),tx.material.count({where:active}),tx.material.count({where:{AND:[active,{currentStock:{gt:0}}]}}),tx.material.count({where:{AND:[active,exhaustedWhere]}}),tx.material.count({where:{AND:[active,{purchaseItems:{some:transit}}]}}),tx.material.count({where:{AND:[active,{purchaseItems:{some:defective}}]}})
        ]);
        const pages=Math.max(1,Math.ceil(count/pageSize)),page=Math.min(pageNumber(value(params,'page')),pages);
        const materials=await tx.material.findMany({where,orderBy:sort==='newest'?[{createdAt:'desc'},{id:'asc'}]:[{name:'asc'},{id:'asc'}],take:pageSize,skip:(page-1)*pageSize});
        const totals=materials.length?await tx.$queryRaw<Array<{materialId:string;good:Prisma.Decimal;defective:Prisma.Decimal;transit:Prisma.Decimal;stockValue:Prisma.Decimal;costKinds:bigint}>>(Prisma.sql`
            SELECT i."materialId",
              COALESCE(SUM(GREATEST(i."remainingQuantity"-i."defectiveQuantity",0)) FILTER (WHERE p."receiptStatus"='RECEIVED'),0) AS good,
              COALESCE(SUM(LEAST(i."remainingQuantity",i."defectiveQuantity")) FILTER (WHERE p."receiptStatus"='RECEIVED'),0) AS defective,
              COALESCE(SUM(GREATEST(i."remainingQuantity"-i."defectiveQuantity",0)) FILTER (WHERE p."receiptStatus"='IN_TRANSIT'),0) AS transit,
              COALESCE(SUM(CASE WHEN i."remainingQuantity">0 THEN i."remainingCost"/i."remainingQuantity"*GREATEST(i."remainingQuantity"-i."defectiveQuantity",0) ELSE 0 END) FILTER (WHERE p."receiptStatus"='RECEIVED'),0) AS "stockValue",
              COUNT(DISTINCT i."finalUnitCost") FILTER (WHERE p."receiptStatus"='RECEIVED' AND i."remainingQuantity">i."defectiveQuantity") AS "costKinds"
            FROM "MaterialPurchaseItem" i JOIN "MaterialPurchase" p ON p.id=i."purchaseId"
            WHERE p."businessId"=${businessId} AND p."deletedAt" IS NULL AND i."materialId" IN (${Prisma.join(materials.map(m=>m.id))}) GROUP BY i."materialId"
        `):[];
        const items=materials.map(m=>{const t=totals.find(t=>t.materialId===m.id),good=t?.good??new Prisma.Decimal(0);return {...m,defectiveStock:t?.defective.toString()??'0',inTransit:t?.transit.toString()??'0',stockValue:good.gt(0)?t!.stockValue.toFixed(2):null,unitCost:good.gt(0)?t!.stockValue.div(good).toFixed(6):null,weighted:Number(t?.costKinds??0)>1};});
        const selected=value(params,'material');
        const material=selected?await tx.material.findFirst({where:{AND:[active,{id:selected}]}}):null;
        const lotWhere:Prisma.MaterialPurchaseItemWhereInput={materialId:material?.id??'',purchase:{businessId,deletedAt:null}};
        const lotCount=material?await tx.materialPurchaseItem.count({where:lotWhere}):0,lotPages=Math.max(1,Math.ceil(lotCount/20)),lotPage=Math.min(pageNumber(value(params,'lotPage')),lotPages);
        const lots=material?await tx.materialPurchaseItem.findMany({where:lotWhere,include:{purchase:{select:{id:true,number:true,name:true,purchaseDate:true,country:true,receiptStatus:true}}},orderBy:[{purchase:{purchaseDate:'desc'}},{id:'asc'}],take:20,skip:(lotPage-1)*20}):[];
        return JSON.parse(JSON.stringify({q,filter,sort,page,pages,count,stats:{all,available,exhausted,inTransit,withDefects},items,material,lots,lotPage,lotPages})) as MaterialInventoryData;
}

export type MaterialInventoryData={q:string;filter:string;sort:string;page:number;pages:number;count:number;stats:{all:number;available:number;exhausted:number;inTransit:number;withDefects:number};items:Array<{id:string;name:string;brand:string|null;category:string|null;color:string|null;size:string|null;characteristics:string|null;description:string|null;imageUrl:string|null;unit:string;currentStock:string;defectiveStock:string;inTransit:string;stockValue:string|null;unitCost:string|null;weighted:boolean}>;material:{id:string;name:string;unit:string}|null;lots:Array<{id:string;quantity:string;defectiveQuantity:string;remainingQuantity:string;finalUnitCost:string;remainingCost:string;purchase:{id:string;number:number;name:string|null;purchaseDate:string;country:string|null;receiptStatus:string}}>;lotPage:number;lotPages:number};
