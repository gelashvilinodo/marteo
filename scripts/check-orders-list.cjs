const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { Decimal } = require('@prisma/client-runtime-utils');
function load(file, imports) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in imports))throw Error(n);return imports[n];},Date,Map,Number});
 return exports;
}
const Prisma = {Decimal, TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'},join:values=>values};
const payable = load('lib/orders/order-payable-total.ts',{'@/generated/prisma/client':{Prisma}});
const {getOrdersPage} = load('lib/orders/get-orders-page.ts',{'server-only':{},'@/generated/prisma/client':{Prisma},'./order-payable-total':payable,'./orders-period':{resolveOrdersPeriod:()=>({start:new Date('2026-10-01'),end:new Date('2026-11-01'),period:'month',from:'2026-10-01',to:'2026-10-31',error:null})}});
const base = {
 id:'order-a', number:36, recipientPhone:'test',recipientFirstName:'Test',recipientLastName:'Customer',shippingAddress:'Address',notes:'Notes',status:'PROCESSING',paymentStatus:'PARTIALLY_PAID',courierFee:new Decimal('0.20'),stockReturnedAt:null,deleteRequestedAt:null,fulfillmentCycle:2,
 createdAt:new Date('2026-10-14'),updatedAt:new Date('2026-10-14'),invoiceVersion:2,lastPrintedInvoiceVersion:1,invoicePrintedAt:null,
 items:[{id:'item-a',inventoryItemId:null,source:'MANUAL',condition:'GOOD',name:'Product',quantity:3,description:'Long product description',imageUrl:null,color:'black',size:'S',unitPrice:new Decimal('0.10'),unitCost:new Decimal(0),totalCost:null,stockRestoredAt:null},{id:'item-b',inventoryItemId:'stock-a',source:'INVENTORY',condition:'DEFECTIVE',name:'Photo product',quantity:1,description:'Second description',imageUrl:'https://example.com/image.png',color:null,size:null,unitPrice:new Decimal('1.20'),unitCost:new Decimal('0.50'),totalCost:new Decimal('0.50'),stockRestoredAt:null}],
 payments:[{id:'payment-a',amount:new Decimal('0.40'),method:'CASH',bankName:null,createdAt:new Date('2026-10-14')}], returns:[]
};
function project(row, select) {
 const out={};for(const [key,value] of Object.entries(select)){if(!value)continue;if(value===true)out[key]=row[key];else if(Array.isArray(row[key]))out[key]=row[key].map(child=>project(child,value.select));}
 return out;
}
let rows, listSelect, detailSelect, aggregates;
const tx = {
 order:{groupBy:async args=>{assert.equal(args.where.businessId,'business-a');assert.equal(args.where.deletedAt,null);return [{status:'PROCESSING',_count:{_all:rows.length}}];},count:async()=>rows.length,
 findMany:async args=>{assert.equal(args.where.businessId,'business-a');assert.equal(args.where.deletedAt,null);if(args.take===1)detailSelect=args;else listSelect=args;return rows.map(row=>project(row,args.select));}},
 $queryRaw:async (strings,...params)=>{const sql=strings.join('?');if(sql.includes('newCount'))return [{newCount:1n,updatedCount:1n}];aggregates++;assert.ok(sql.includes('SUM(p."amount")'));assert.ok(sql.includes('o."businessId" = ?'));assert.ok(sql.includes('o."deletedAt" IS NULL'));assert.equal(params[0],'business-a');return rows.map(row=>({orderId:row.id,amount:row.payments.reduce((s,p)=>s.plus(p.amount),new Decimal(0)).toString()}));}
};
const client={$transaction:async callback=>callback(tx)};
const received=q=>({status:'RECEIVED',fulfillmentCycle:2,items:[{orderItemId:'item-a',quantity:q}]});
(async()=>{
 const fixtures=[{}, {returns:[received(1)]}, {returns:[received(3)],payments:[{...base.payments[0],amount:new Decimal('2.00')}]}, {stockReturnedAt:new Date('2026-10-14')}, {returns:[{...received(1),fulfillmentCycle:1},{status:'PENDING',fulfillmentCycle:1,items:[{orderItemId:'item-a',quantity:1}]}]}, {payments:[...base.payments,{...base.payments[0],id:'refund-a',amount:new Decimal('-0.20')}]}, {items:[],payments:[]}, {items:base.items.map(i=>({...i,stockRestoredAt:new Date('2026-10-14')}))}];
 for(const changes of fixtures){rows=[{...base,...changes}];aggregates=0;const list=await getOrdersPage(client,'business-a',{});assert.equal(aggregates,1);const detail=await getOrdersPage(client,'business-a',{},'order-a');assert.equal(aggregates,1);const a=list.orders[0],b=detail.orders[0];for(const key of ['total','productsTotal','paidAmount','remainingAmount','refundDue','productQuantity','hasReturnHistory','hasPastReturns','pendingReturnQuantity','receivedReturnQuantity','printState'])assert.equal(a[key],b[key],key);assert.equal(JSON.stringify(a.missingManualCosts),JSON.stringify(b.missingManualCosts));assert.equal(a.detailsLoaded,false);assert.equal(b.detailsLoaded,true);assert.ok(!('payments' in a));assert.ok(!('returns' in a));assert.ok(!('notes' in a));assert.ok(!('shippingAddress' in a));assert.equal(b.notes,'Notes');assert.equal(b.payments.length,rows[0].payments.length);assert.equal(listSelect.select.payments,false);assert.equal(listSelect.select.items.select.description,false);assert.equal(detailSelect.select.items.select.description,true);assert.equal(listSelect.take,15);assert.equal(detailSelect.where.id,'order-a');}
 rows=[];aggregates=0;const empty=await getOrdersPage(client,'business-a',{});assert.equal(empty.orders.length,0);assert.equal(aggregates,0);
 rows=[{...base,returns:[received(4)]}];await assert.rejects(()=>getOrdersPage(client,'business-a',{}));
 rows=Array.from({length:31},(_,i)=>({...base,id:'order-'+i}));
 await getOrdersPage(client,'business-a',{page:'2',status:'shipped',payment:'PAID',q:'#36',sort:'number-asc'});
 assert.equal(listSelect.skip,15);assert.equal(listSelect.take,15);assert.equal(listSelect.where.status,'SHIPPED');assert.equal(listSelect.where.paymentStatus,'PAID');assert.ok(listSelect.where.OR.some(entry=>entry.number===36));assert.equal(listSelect.orderBy[0].number.sort,'asc');
 await getOrdersPage(client,'business-a',{page:'999'});assert.equal(listSelect.skip,30);
 await getOrdersPage(client,'business-a',{page:'invalid',status:'invalid',payment:'invalid',sort:'invalid'});assert.equal(listSelect.skip,0);assert.equal(listSelect.where.status,undefined);assert.equal(listSelect.where.paymentStatus,undefined);assert.equal(listSelect.orderBy[0].createdAt,'desc');
 console.log('Orders list checks passed (10 financial/list/detail scenarios plus filters, sorting and pagination).');
})().catch(error=>{console.error(error);process.exitCode=1;});
