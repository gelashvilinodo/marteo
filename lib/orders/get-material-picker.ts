import 'server-only';
import { Prisma } from '@/generated/prisma/client';
export async function getMaterialPicker(tx:Prisma.TransactionClient,businessId:string,q:string,requestedPage:number){
    const where:Prisma.MaterialWhereInput={businessId,currentStock:{gt:0},...(q?{OR:['name','category','color','size','brand'].map(key=>({[key]:{contains:q.slice(0,150),mode:'insensitive'}}))}:{})};
    const totalProducts=await tx.material.count({where}),totalPages=Math.max(1,Math.ceil(totalProducts/20)),currentPage=Math.min(requestedPage,totalPages);
    const materials=await tx.material.findMany({where,orderBy:[{name:'asc'},{id:'asc'}],take:20,skip:(currentPage-1)*20,include:{purchaseItems:{where:{purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}},orderBy:[{purchase:{purchaseDate:'asc'}},{id:'asc'}],select:{remainingQuantity:true,defectiveQuantity:true,remainingCost:true}}}});
    return {totalProducts,totalPages,currentPage,products:materials.map(m=>({id:m.id,source:'MATERIAL' as const,unit:m.unit,sku:'',name:m.name,brand:m.brand??'',category:m.category??'',description:m.description??'',color:m.color??'',size:m.size??'',imageUrl:m.imageUrl,salePrice:null,totalStock:m.currentStock.toNumber(),goodStock:m.currentStock.toNumber(),defectiveStock:0,materialLots:m.purchaseItems.map(l=>({remainingQuantity:l.remainingQuantity.toString(),defectiveQuantity:l.defectiveQuantity.toString(),remainingCost:l.remainingCost.toString()}))}))};
}
