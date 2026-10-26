import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { MaterialError, calculate, type MaterialInput } from "./input";

type Tx = Prisma.TransactionClient;
export async function lockBusiness(tx: Tx, businessId: string, userId: string) {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    const member = await tx.businessMembership.findUnique({where:{userId_businessId:{userId,businessId}}});
    if (!member || !["OWNER","ADMIN"].includes(member.role)) throw new MaterialError("პარტიის მართვის უფლება არ გაქვს.",403);
}
export async function writable(tx:Tx,businessId:string,id:string,version:string) {
    const old = await tx.materialPurchase.findFirst({where:{id,businessId,deletedAt:null},include:{items:true}});
    if (!old) throw new MaterialError("პარტია ვერ მოიძებნა.",404);
    if (old.updatedAt.toISOString()!==version) throw new MaterialError("პარტია შეიცვალა. განაახლე სია და გახსენი თავიდან.",409);
    if (old.items.some(i=>!i.remainingQuantity.equals(i.quantity)||!i.remainingCost.equals(i.totalCost))) throw new MaterialError("მასალა უკვე გამოყენებულია. პარტიის შეცვლა ან წაშლა დაუშვებელია.",409);
    if(await tx.materialOrderAllocation.count({where:{purchaseItemId:{in:old.items.map(i=>i.id)}}}))throw new MaterialError("მასალა შეკვეთაში უკვე გამოყენებულია. პარტიის შეცვლა ან წაშლა დაუშვებელია.",409);
    return old;
}
export async function saveMaterialPurchase(tx:Tx,businessId:string,userId:string,input:MaterialInput,images:Map<number,string>,edit?:{id:string;version:string}) {
    await lockBusiness(tx,businessId,userId);
    if (!edit) {
        const repeated=await tx.materialPurchase.findUnique({where:{businessId_requestId:{businessId,requestId:input.requestId}}});
        if (repeated) return {id:repeated.id,replayed:true};
    }
    if(edit) { const replay=await tx.materialPurchase.findFirst({where:{id:edit.id,businessId,lastRequestId:input.requestId}});if(replay)return {id:replay.id,replayed:true}; }
    const old=edit?await writable(tx,businessId,edit.id,edit.version):null;
    const costs=calculate(input);
    // Validate all source IDs before changing stock. Source metadata/unit are authoritative.
    const sources=new Map((await tx.material.findMany({where:{businessId,id:{in:input.items.flatMap(i=>i.materialId?[i.materialId]:[])}}})).map(m=>[m.id,m]));
    if (input.items.some(i=>i.materialId&&!sources.has(i.materialId))) throw new MaterialError("არჩეული მასალა ამ ბიზნესში არ მოიძებნა.",404);
    if (input.items.some(i=>i.materialId&&sources.get(i.materialId)!.unit!==i.unit)) throw new MaterialError("არსებული მასალის საზომი ერთეულის შეცვლა დაუშვებელია.");
    if (old) {
        if (old.receiptStatus==='RECEIVED') for (const i of old.items) {
            const removed=await tx.material.updateMany({where:{id:i.materialId,businessId,currentStock:{gte:i.quantity.minus(i.defectiveQuantity)}},data:{currentStock:{decrement:i.quantity.minus(i.defectiveQuantity)}}});
            if(removed.count!==1)throw new MaterialError("მასალის ნაშთი შეიცვალა.",409);
        }
        await tx.materialPurchaseItem.deleteMany({where:{purchaseId:old.id}});
    }
    const country=input.country?((await tx.materialPurchase.findFirst({where:{businessId,country:{equals:input.country,mode:"insensitive"}},select:{country:true}}))?.country??input.country):null;
    const values={lastRequestId:input.requestId,name:input.name||null,country,note:input.note||null,purchaseDate:input.purchaseDate,receiptStatus:input.receiptStatus,shippingCost:input.shippingCost,customsCost:input.customsCost,otherCost:input.otherCost,updatedById:userId};
    const purchase=old?await tx.materialPurchase.update({where:{id:old.id},data:{...values,updatedAt:new Date(Math.max(Date.now(),old.updatedAt.getTime()+1))}}):await tx.materialPurchase.create({data:{...values,businessId,createdById:userId,requestId:input.requestId,number:((await tx.materialPurchase.aggregate({where:{businessId},_max:{number:true}}))._max.number??0)+1}});
    for (let index=0;index<input.items.length;index++) {
        const i=input.items[index], cost=costs.rows[index];
        let material=i.materialId?sources.get(i.materialId)!:null;
        if(!material) material=await tx.material.create({data:{businessId,name:i.name,brand:i.brand||null,category:i.category||null,description:i.description||null,color:i.color||null,size:i.size||null,characteristics:i.characteristics||null,unit:i.unit,imageUrl:images.get(index)||null}});
        const snapshot={name:material.name,brand:material.brand??'',category:material.category??'',description:material.description??'',color:material.color??'',size:material.size??'',characteristics:material.characteristics??'',unit:material.unit,imageUrl:material.imageUrl??''};
        await tx.materialPurchaseItem.create({data:{purchaseId:purchase.id,materialId:material.id,name:material.name,snapshot,quantity:i.quantity,defectiveQuantity:i.defectiveQuantity,remainingQuantity:i.quantity,remainingCost:cost.totalCost,unitPurchasePrice:i.unitPurchasePrice,...cost}});
        if(input.receiptStatus==='RECEIVED') await tx.material.update({where:{id:material.id},data:{currentStock:{increment:i.quantity.minus(i.defectiveQuantity)}}});
    }
    return {id:purchase.id,replayed:false};
}
export async function actOnPurchase(tx:Tx,businessId:string,userId:string,id:string,version:string,action:'delete'|'receive',requestId:string) {
    await lockBusiness(tx,businessId,userId);
    if(await tx.materialPurchase.findFirst({where:{id,businessId,lastRequestId:requestId}}))return;
    const old=await writable(tx,businessId,id,version);
    if(action==='receive') {
        if(old.receiptStatus==='RECEIVED')return;
        for(const i of old.items) await tx.material.update({where:{id:i.materialId},data:{currentStock:{increment:i.quantity.minus(i.defectiveQuantity)}}});
        await tx.materialPurchase.update({where:{id},data:{receiptStatus:'RECEIVED',updatedById:userId,lastRequestId:requestId,updatedAt:new Date(Math.max(Date.now(),old.updatedAt.getTime()+1))}});
    } else {
        if(old.receiptStatus==='RECEIVED') for(const i of old.items) {
            const result=await tx.material.updateMany({where:{id:i.materialId,businessId,currentStock:{gte:i.quantity.minus(i.defectiveQuantity)}},data:{currentStock:{decrement:i.quantity.minus(i.defectiveQuantity)}}});
            if(result.count!==1)throw new MaterialError("მასალის ნაშთი შეიცვალა.",409);
        }
        await tx.materialPurchase.update({where:{id},data:{deletedAt:new Date(),updatedById:userId,lastRequestId:requestId,updatedAt:new Date(Math.max(Date.now(),old.updatedAt.getTime()+1))}});
    }
}
