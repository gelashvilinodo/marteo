import { hasBusinessFeature, businessFeatureMessage, type BusinessMode } from "@/lib/business/business-mode";
import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { OrderValidationError } from './validate-order';
import { materialCost } from '@/lib/production/input';
import { numericQuantities, qsub, type NumericQuantities } from './quantity';
type Tx=Prisma.TransactionClient;
type Allocation=NumericQuantities<Prisma.MaterialOrderAllocationGetPayload<object>>;
export async function consumeOrderMaterial(tx:Tx,businessId:string,materialId:string,quantity:number){
    const [business]=await tx.$queryRaw<Array<{mode:BusinessMode}>>`SELECT mode FROM "Business" WHERE id=${businessId} FOR UPDATE`;
    if(!business||!hasBusinessFeature(business.mode,"manufacturing"))throw new OrderValidationError(businessFeatureMessage("manufacturing"),403);
    const material=await tx.material.findFirst({where:{id:materialId,businessId}});
    if(!material||material.currentStock.lt(quantity))throw new OrderValidationError('მასალის ხელმისაწვდომი ნაშთი არასაკმარისია.',409);
    if(material.unit==='PCS'&&!Number.isSafeInteger(quantity))throw new OrderValidationError('ცალობით მასალის რაოდენობა მთელი რიცხვი უნდა იყოს.');
    const lots=await tx.materialPurchaseItem.findMany({where:{materialId,purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}},orderBy:[{purchase:{purchaseDate:'asc'}},{id:'asc'}]});
    let needed=new Prisma.Decimal(quantity),totalCost=new Prisma.Decimal(0);const allocations=[];
    for(const lot of lots){if(needed.isZero())break;const take=Prisma.Decimal.min(needed,Prisma.Decimal.max(lot.remainingQuantity.minus(lot.defectiveQuantity),0));if(take.lte(0))continue;const cost=materialCost(lot.remainingCost,lot.remainingQuantity,take);
        await tx.materialPurchaseItem.update({where:{id:lot.id},data:{remainingQuantity:{decrement:take},remainingCost:{decrement:cost}}});allocations.push({materialId,purchaseItemId:lot.id,quantity:take,totalCost:cost});totalCost=totalCost.plus(cost);needed=needed.minus(take);
    }
    if(needed.gt(0))throw new OrderValidationError('მასალის პარტიების ნაშთი შეიცვალა. განაახლე მონაცემები.',409);
    await tx.material.update({where:{id:materialId},data:{currentStock:{decrement:quantity}}});return {material,allocations,totalCost};
}
export async function restoreMaterialAllocations(tx:Tx,businessId:string,materialId:string,allocations:Allocation[],quantity:number,condition:'GOOD'|'DEFECTIVE'){
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id=${businessId} FOR UPDATE`;
    const material=await tx.material.findFirst({where:{id:materialId,businessId}});if(!material)throw new OrderValidationError('მასალა ვერ მოიძებნა.',409);
    let needed=quantity;
    for(const allocation of allocations){const available=qsub(qsub(allocation.quantity,allocation.returnedQuantity),allocation.transferredQuantity),take=Math.min(needed,available);if(take<=0)continue;
        const lot=await tx.materialPurchaseItem.findFirst({where:{id:allocation.purchaseItemId,materialId,purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'}}});if(!lot)throw new OrderValidationError('მასალის საწყისი პარტია ვერ მოიძებნა.',409);
        const remainingCost=allocation.totalCost.minus(allocation.returnedCost).minus(allocation.transferredCost),cost=materialCost(remainingCost,new Prisma.Decimal(available),new Prisma.Decimal(take));
        await tx.materialOrderAllocation.update({where:{id:allocation.id},data:{returnedQuantity:{increment:take},returnedCost:{increment:cost}}});
        await tx.materialPurchaseItem.update({where:{id:lot.id},data:{remainingQuantity:{increment:take},remainingCost:{increment:cost},...(condition==='DEFECTIVE'?{defectiveQuantity:{increment:take}}:{})}});
        if(condition==='GOOD')await tx.material.update({where:{id:materialId},data:{currentStock:{increment:take}}});needed=qsub(needed,take);if(needed===0)break;
    }
    if(needed!==0)throw new OrderValidationError('მასალის ეს რაოდენობა უკვე დაბრუნებულია ან განაწილება შეიცვალა.',409);
}
export async function materialAllocations(tx:Tx,orderItemId:string){return numericQuantities(await tx.materialOrderAllocation.findMany({where:{orderItemId},orderBy:{id:'asc'}}));}
