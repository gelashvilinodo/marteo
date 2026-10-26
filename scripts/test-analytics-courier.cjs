/* eslint-disable @typescript-eslint/no-require-imports -- Read-only PostgreSQL regression checks. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript'),{Client}=require('pg');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let reader;
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id==='@/lib/database/pg-reader')return {createPgReader:()=>reader};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {Prisma}=require('../generated/prisma/client.ts');
const {getAnalyticsPage}=require('../lib/analytics/get-analytics-page.ts');
const {getFinancialTrend}=require('../lib/analytics/get-financial-trend.ts');
const {getFinancialMovements}=require('../lib/analytics/get-financial-movements.ts');
const {getOrderMovementDetail}=require('../lib/analytics/get-order-movement-detail.ts');
const {getHomeSummary}=require('../lib/dashboard/get-home-summary.ts');
const {getHomeTrend}=require('../lib/dashboard/get-home-trend.ts');
const tables={
 Order:'id text, "businessId" text, "analyticsPendingCost" boolean, status text, "createdAt" timestamp, "deletedAt" timestamp, number int',
 OrderPayment:'id text, "orderId" text, amount numeric, "createdAt" timestamp, method text',
 OrderFinancialEntry:'id text, "businessId" text, "orderId" text, "productRevenueDelta" numeric, "deliveryRevenueDelta" numeric, "costOfGoodsDelta" numeric, "costComplete" boolean, "occurredAt" timestamp, "createdAt" timestamp, kind text, "orderNumber" int',
 Expense:'id text, "businessId" text, amount numeric, "expenseDate" timestamp, "createdAt" timestamp, category text, title text',
 InventoryWriteOff:'id text, "businessId" text, "totalCost" numeric, "createdAt" timestamp, quantity int, name text, color text, size text',
 Purchase:'id text, "businessId" text, "purchaseDate" timestamp, "createdAt" timestamp, number int, name text, "shippingCost" numeric, "customsCost" numeric, "otherCost" numeric, "receiptStatus" text',
 PurchaseItem:'id text, "purchaseId" text, quantity int, "unitPurchasePrice" numeric',
 InventoryStockLot:'"inventoryItemId" text, "purchaseItemId" text, "remainingQuantity" int',
 InventoryItem:'id text, "businessId" text, "isActive" boolean',
 Product:'"businessId" text',Customer:'"businessId" text',
};
const date='2026-10-20T10:00:00';
function data(fee,returned){return {
 Order:[{id:'o',businessId:'b',analyticsPendingCost:false,status:'COMPLETED',createdAt:date,deletedAt:null,number:1}],
 OrderPayment:[{id:'p',orderId:'o',amount:100+fee,createdAt:date,method:'CASH'},...(returned?[{id:'refund',orderId:'o',amount:-100,createdAt:date,method:'CASH'}]:[])],
 OrderFinancialEntry:[{id:'f',businessId:'b',orderId:'o',productRevenueDelta:100,deliveryRevenueDelta:fee,costOfGoodsDelta:40,costComplete:true,occurredAt:date,createdAt:date,kind:'SALE',orderNumber:1},...(returned?[{id:'r',businessId:'b',orderId:'o',productRevenueDelta:-100,deliveryRevenueDelta:0,costOfGoodsDelta:-40,costComplete:true,occurredAt:date,createdAt:date,kind:'RETURN',orderNumber:1}]:[])],
 Expense:[{id:'e',businessId:'b',amount:10,expenseDate:date,createdAt:date,category:'RENT',title:'Rent'}],
};}
(async()=>{const c=new Client({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL});await c.connect();try{await c.query('BEGIN READ ONLY');let count=0;for(const fee of [0,10,1000])for(const returned of [false,true]){
 const fixture=data(fee,returned);
 const run=async(query,...params)=>{
  const q=Array.isArray(query)?{text:query.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values:params}:query;
  const values=[...q.values,JSON.stringify(Object.fromEntries(Object.keys(tables).map(k=>[k,fixture[k]||[]])))];
  const defs=Object.entries(tables).map(([name,cols])=>`"${name}" AS (SELECT * FROM jsonb_to_recordset($${values.length}::jsonb->'${name}') AS x(${cols}))`).join(',');
  return (await c.query(q.text.replace(/WITH\s/,`WITH ${defs}, `),values)).rows;
 };
 const db={$queryRaw:run};reader={...db,$disconnect:async()=>{}};
 const params={period:'custom',from:'2026-10-01',to:'2026-10-31'};
 const a=await getAnalyticsPage(db,'b',params);
 assert.equal(a.sales,returned?'0.00':'100.00');assert.equal(a.profit,returned?'-10.00':'50.00');assert.equal(a.recordedExpenses,'10.00');assert.equal(a.received,(100+fee).toFixed(2));
 const trend=await getFinancialTrend(db,'b','month',new Date('2026-10-24T10:00:00Z'));
 const point=trend.find(p=>p.date==='2026-10-20');assert.equal(point.sales,a.sales);assert.equal(point.profit,a.profit);
 const movements=await getFinancialMovements(db,'b',params.from,params.to,{movement:'financial'});assert.equal(movements.rows[0].amount,a.sales);
 const home=await getHomeSummary('b',params,{orders:false,stock:false,businessState:false});assert.equal(home.sales,a.sales);assert.equal(home.profit,a.profit);
 const homeTrend=await getHomeTrend('b',params.from,params.to,true);const homePoint=homeTrend.points.find(p=>p.date==='2026-10-20');assert.equal(homePoint.sales,a.sales);assert.equal(homePoint.profit,a.profit);
 const entries=fixture.OrderFinancialEntry.map(f=>({...f,occurredAt:new Date(f.occurredAt+'Z'),productRevenueDelta:new Prisma.Decimal(f.productRevenueDelta),deliveryRevenueDelta:new Prisma.Decimal(f.deliveryRevenueDelta),costOfGoodsDelta:new Prisma.Decimal(f.costOfGoodsDelta)}));
 const payments=fixture.OrderPayment.map(p=>({...p,createdAt:new Date(p.createdAt+'Z'),amount:new Prisma.Decimal(p.amount),bankName:null}));
 const detail=await getOrderMovementDetail({$transaction:fn=>fn({orderFinancialEntry:{findFirst:async()=>({orderId:'o',orderNumber:1}),findMany:async()=>entries},orderPayment:{findMany:async()=>payments}})},'b','financial','f',params);
 assert.equal(detail.sales,a.sales);assert.equal(detail.profit,returned?'0.00':'60.00');assert.equal(detail.history.find(h=>h.id==='financial:f').amount,'100.00');
 console.log(`PASS fee=${fee}, returned=${returned}: summary, trend, movements, home and detail`);count++;
 }console.log(`${count} cross-view scenarios passed (read-only).`);
 }finally{await c.query('ROLLBACK');await c.end()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
