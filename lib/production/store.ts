import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { materialCost, outputCosts, ProductionError, type ProductionInput } from './input';
import { createInventorySkuAllocator } from '@/lib/purchases/create-inventory-sku';
import { lockBusiness } from '@/lib/material-purchases/store';
type Tx=Prisma.TransactionClient;
export async function saveProduction(tx:Tx,businessId:string,userId:string,input:ProductionInput,images:Map<string,string>=new Map(),removedImages:Set<string>=new Set()){
    await lockBusiness(tx,businessId,userId);
    const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const replay=await tx.productionRequest.findUnique({where:{businessId_requestId:{businessId,requestId:input.requestId}}});
    if(replay){if(replay.inputHash!==fingerprint)throw new ProductionError('იგივე მოთხოვნის კოდით სხვა მონაცემები ვერ შეინახება.',409);return {id:replay.productionId,replayed:true};}
    const old=input.id?await tx.production.findFirst({where:{id:input.id,businessId},include:{inputs:{include:{allocations:true}},outputs:{where:{active:true},include:{stockLot:true}}}}):null;
    if(input.id&&!old)throw new ProductionError('წარმოება ვერ მოიძებნა.',404);
    if(old&&old.updatedAt.toISOString()!==input.version)throw new ProductionError('წარმოება სხვა ფანჯარაში შეიცვალა. განაახლე სია და გახსენი თავიდან.',409);
    // Product sales lock the same inventory rows; lock before reading their live balances.
    const inventoryIds=[...new Set([...input.outputs.flatMap(o=>o.inventoryItemId?[o.inventoryItemId]:[]),...(old?.outputs.flatMap(o=>o.inventoryItemId?[o.inventoryItemId]:[])??[])])].sort();
    if(inventoryIds.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM "InventoryItem" WHERE "businessId"=${businessId} AND id IN (${Prisma.join(inventoryIds)}) ORDER BY id FOR UPDATE`);
    const stockLots=old?await tx.inventoryStockLot.findMany({where:{id:{in:old.outputs.flatMap(o=>o.stockLotId?[o.stockLotId]:[])}}}):[];
    const inventories=await tx.inventoryItem.findMany({where:{businessId,isActive:true,id:{in:inventoryIds}},include:{product:true}});
    if(input.outputs.some(o=>o.inventoryItemId&&!inventories.some(i=>i.id===o.inventoryItemId)))throw new ProductionError('არჩეული პროდუქტი ამ ბიზნესის აქტიურ მარაგში ვერ მოიძებნა.',409);
    // Material-purchase writes also hold the business lock. Restore exact quantities and cents before FIFO reallocation.
    if(old){for(const line of old.inputs){for(const allocation of line.allocations){await tx.materialPurchaseItem.update({where:{id:allocation.purchaseItemId},data:{remainingQuantity:{increment:allocation.quantity},remainingCost:{increment:allocation.totalCost}}});}await tx.material.update({where:{id:line.materialId},data:{currentStock:{increment:line.quantity}}});}await tx.productionInput.deleteMany({where:{productionId:old.id}});}
    const materials=await tx.material.findMany({where:{businessId,id:{in:input.materials.map(m=>m.materialId)}}});
    if(materials.length!==input.materials.length)throw new ProductionError('მასალა ამ ბიზნესში ვერ მოიძებნა.',404);
    const plans=[];let materialsCost=new Prisma.Decimal(0);
    for(const line of input.materials){
        const material=materials.find(m=>m.id===line.materialId)!;
        if(material.unit==='PCS'&&!line.quantity.isInteger())throw new ProductionError(`${material.name}: ცალობით რაოდენობა მთელი რიცხვი უნდა იყოს.`);
        if(material.currentStock.lt(line.quantity))throw new ProductionError(`${material.name}: მასალის ხელმისაწვდომი ნაშთი არასაკმარისია.`,409);
        const lots=await tx.materialPurchaseItem.findMany({where:{materialId:material.id,purchase:{businessId,deletedAt:null,receiptStatus:'RECEIVED'},remainingQuantity:{gt:0}},orderBy:[{purchase:{purchaseDate:'asc'}},{id:'asc'}]});
        let needed=line.quantity;const allocations=[];let cost=new Prisma.Decimal(0);
        for(const lot of lots){if(needed.isZero())break;const available=Prisma.Decimal.max(lot.remainingQuantity.minus(lot.defectiveQuantity),0),take=Prisma.Decimal.min(available,needed);if(take.isZero())continue;
            const cents=materialCost(lot.remainingCost,lot.remainingQuantity,take);await tx.materialPurchaseItem.update({where:{id:lot.id},data:{remainingQuantity:{decrement:take},remainingCost:{decrement:cents}}});
            allocations.push({purchaseItemId:lot.id,quantity:take,totalCost:cents});cost=cost.plus(cents);needed=needed.minus(take);
        }
        if(needed.gt(0))throw new ProductionError(`${material.name}: პარტიების ნაშთი არ ემთხვევა. განაახლე მარაგი.`,409);
        await tx.material.update({where:{id:material.id},data:{currentStock:{decrement:line.quantity}}});
        plans.push({materialId:material.id,name:material.name,unit:material.unit,quantity:line.quantity,totalCost:cost,allocations});materialsCost=materialsCost.plus(cost);
    }
    const totalCost=materialsCost.plus(input.overheadCost).plus(input.additionalCosts.reduce((s,c)=>s.plus(c.amount),new Prisma.Decimal(0)));
    if(totalCost.gte('10000000000'))throw new ProductionError('წარმოების სრული ღირებულება ზედმეტად დიდია.');
    const values={name:input.name||null,productionDate:input.productionDate,status:input.status,note:input.note||null,overheadCost:input.overheadCost,additionalCosts:input.additionalCosts.map(c=>({name:c.name,amount:c.amount.toFixed(2)})),materialsCost,totalCost,updatedById:userId,completedAt:input.status==='COMPLETED'?(old?.completedAt??new Date()):null};
    const production=old?await tx.production.update({where:{id:old.id},data:{...values,updatedAt:new Date(Math.max(Date.now(),old.updatedAt.getTime()+1))}}):await tx.production.create({data:{...values,businessId,createdById:userId,number:((await tx.production.aggregate({where:{businessId},_max:{number:true}}))._max.number??0)+1}});
    for(const plan of plans){const {allocations,...line}=plan;await tx.productionInput.create({data:{...line,productionId:production.id,allocations:{create:allocations}}});}
    const costs=outputCosts(totalCost,input.outputs.map(o=>o.costShare));
    const nextSku=await createInventorySkuAllocator(tx,businessId);
    for(const previous of old?.outputs??[]){
        if(input.outputs.some(o=>o.rowKey===previous.rowKey)&&input.status==='COMPLETED')continue;
        const lot=stockLots.find(l=>l.id===previous.stockLotId);
        if(lot){if(lot.remainingQuantity!==lot.quantity||lot.remainingDefectiveQuantity||lot.writtenOffQuantity||lot.writtenOffDefectiveQuantity)throw new ProductionError('უკვე გამოყენებული პროდუქტის ამოღება ან წარმოების დაუმთავრებლად დაბრუნება შეუძლებელია.',409);
            await tx.inventoryStockLot.update({where:{id:lot.id},data:{quantity:0,remainingQuantity:0,remainingCost:0,unitCost:0}});
            await tx.inventoryItem.update({where:{id:lot.inventoryItemId},data:{currentStock:{decrement:lot.remainingQuantity}}});
            if(lot.remainingQuantity)await tx.inventoryMovement.create({data:{inventoryItemId:lot.inventoryItemId,type:'ADJUSTMENT_OUT',quantity:lot.remainingQuantity,note:`წარმოების #${production.number} შესწორება`}});
        }
        await tx.productionOutput.update({where:{id:previous.id},data:{active:false}});
    }
    for(let index=0;index<input.outputs.length;index++){
        const output=input.outputs[index],previous=old?.outputs.find(o=>o.rowKey===output.rowKey),inventory=output.inventoryItemId?inventories.find(i=>i.id===output.inventoryItemId):null;
        if(previous?.stockLotId&&input.status==='COMPLETED'&&previous.inventoryItemId!==output.inventoryItemId)throw new ProductionError('დასრულებული წარმოების პროდუქტის ჩანაცვლებისთვის დაამატე ახალი პროდუქტი და ამოიღე ძველი.',409);
        const metadata=inventory?{name:inventory.product.name,category:inventory.product.category,brand:inventory.product.brand,description:inventory.product.description,color:inventory.color,size:inventory.size,imageUrl:inventory.imageUrl,salePrice:inventory.salePrice}:{name:output.name,category:output.category||null,brand:output.brand||null,description:output.description||null,color:output.color||null,size:output.size||null,imageUrl:images.get(output.rowKey)??(removedImages.has(output.rowKey)?null:previous?.imageUrl??null),salePrice:output.salePrice};
        let inventoryId=output.inventoryItemId,stockLotId:string|null=null;
        const cost=costs[index]??new Prisma.Decimal(0);
        if(input.status==='COMPLETED'){
            let existingLot=stockLots.find(l=>l.id===previous?.stockLotId);
            if(!inventoryId){const product=await tx.product.create({data:{businessId,name:metadata.name,brand:metadata.brand,category:metadata.category,description:metadata.description}});const created=await tx.inventoryItem.create({data:{businessId,productId:product.id,sku:nextSku(),color:metadata.color,size:metadata.size,imageUrl:metadata.imageUrl,salePrice:metadata.salePrice,pricingMethod:metadata.salePrice===null?null:'MANUAL',pricingValue:metadata.salePrice}});inventoryId=created.id;}
            if(existingLot){
                if(existingLot.remainingDefectiveQuantity||existingLot.writtenOffDefectiveQuantity)throw new ProductionError('ამ პროდუქტის დეფექტური ნაშთი ცალკე შეიცვალა. ჯერ შეათანხმე მარაგის მონაცემები.',409);
                const consumedQuantity=previous!.quantity-existingLot.remainingQuantity,consumedCost=previous!.totalCost.minus(existingLot.remainingCost??0),remainingQuantity=output.quantity-consumedQuantity,remainingCost=cost.minus(consumedCost);
                if(consumedCost.lt(0)||remainingQuantity<0||remainingCost.lt(0)||(remainingQuantity===0&&!remainingCost.isZero()))throw new ProductionError('ცვლილება უკვე გამოყენებული პროდუქტის რაოდენობას ან ღირებულებას ეწინააღმდეგება. გაყიდული ნაწილის ისტორიული თვითღირებულება უცვლელი რჩება.',409);
                const delta=remainingQuantity-existingLot.remainingQuantity;
                await tx.inventoryStockLot.update({where:{id:existingLot.id},data:{quantity:output.quantity,remainingQuantity,remainingCost,unitCost:remainingQuantity?remainingCost.div(remainingQuantity).toDecimalPlaces(2):0}});
                await tx.inventoryItem.update({where:{id:inventoryId},data:{currentStock:{increment:delta}}});stockLotId=existingLot.id;
                if(delta)await tx.inventoryMovement.create({data:{inventoryItemId:inventoryId,type:delta>0?'ADJUSTMENT_IN':'ADJUSTMENT_OUT',quantity:Math.abs(delta),note:`წარმოების #${production.number} შესწორება`}});
            }else{
                existingLot=await tx.inventoryStockLot.create({data:{inventoryItemId:inventoryId,quantity:output.quantity,remainingQuantity:output.quantity,remainingCost:cost,unitCost:cost.div(output.quantity).toDecimalPlaces(2),availableAt:input.productionDate}});stockLotId=existingLot.id;
                await tx.inventoryItem.update({where:{id:inventoryId},data:{currentStock:{increment:output.quantity}}});
                await tx.inventoryMovement.create({data:{inventoryItemId:inventoryId,type:'ADJUSTMENT_IN',quantity:output.quantity,note:`წარმოება #${production.number}`}});
            }
        }
        const data={...metadata,productionId:production.id,rowKey:output.rowKey,active:true,inventoryItemId:inventoryId,stockLotId,quantity:output.quantity,costShare:output.costShare,totalCost:cost};
        await tx.productionOutput.upsert({where:{productionId_rowKey:{productionId:production.id,rowKey:output.rowKey}},create:data,update:data});
    }
    await tx.productionRequest.create({data:{businessId,requestId:input.requestId,inputHash:fingerprint,productionId:production.id}});
    return {id:production.id,replayed:false};
}
