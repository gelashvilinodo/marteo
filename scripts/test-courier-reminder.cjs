/* eslint-disable @typescript-eslint/no-require-imports -- Read-only PostgreSQL regression tests for the actual reminder query. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const load = Module._load;
Module._load = function(id, parent, ...args) {
    if (id === 'server-only') return {};
    return load.call(this, id.startsWith('@/') ? path.join(root, id.slice(2)) : id, parent, ...args);
};
const { getCourierReminder } = require('../lib/orders/get-courier-reminder.ts');
// CTEs shadow production tables. No test records are inserted, updated or deleted.
const fixtures = `
"Business" AS (SELECT * FROM jsonb_to_recordset($2::jsonb->'businesses') AS x(id text, "courierReminderStartDate" date)),
"Order" AS (SELECT * FROM jsonb_to_recordset($2::jsonb->'orders') AS x(id text, "businessId" text, "createdAt" timestamp, "deletedAt" timestamp, status text, "courierFee" numeric, "paymentStatus" text)),
"OrderPayment" AS (SELECT * FROM jsonb_to_recordset($2::jsonb->'payments') AS x("orderId" text, amount numeric, method text)),
"OrderFinancialEntry" AS (SELECT * FROM jsonb_to_recordset($2::jsonb->'sales') AS x("businessId" text, "orderId" text, kind text, "createdAt" timestamp, "occurredAt" timestamp, "eventKey" text)),
"CourierSettlement" AS (SELECT * FROM jsonb_to_recordset($2::jsonb->'settlements') AS x("businessId" text, amount numeric, "createdAt" timestamp)),
`;
const fresh = () => ({businesses:[{id:'b',courierReminderStartDate:'2026-10-01'}],orders:[],payments:[],sales:[],settlements:[]});
function order(data, {id='o',fee=10,cash=810,status='COMPLETED',created='2026-10-02T10:00:00',completed=created,deleted=null,bank=0}={}) {
    data.orders.push({id,businessId:'b',createdAt:created,deletedAt:deleted,status,courierFee:fee,paymentStatus:'PAID'});
    if(cash) data.payments.push({orderId:id,amount:cash,method:'CASH'});
    if(bank) data.payments.push({orderId:id,amount:bank,method:'BANK_TRANSFER'});
    if(completed) data.sales.push({businessId:'b',orderId:id,kind:'SALE',createdAt:completed});
}
const settle = (d, amount=-800, at='2026-10-03T10:00:00') => d.settlements.push({businessId:'b',amount,createdAt:at});
(async () => {
    const client = new Client({connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL});
    await client.connect();
    try {
        await client.query('BEGIN READ ONLY');
        let passed=0;
        async function check(name, setup, amount, direction, unresolved=0) {
            const data=fresh(); setup(data);
            const result=await getCourierReminder({$queryRaw:async(parts,...values)=>{
                let sql=parts.reduce((s,p,i)=>s+(i ? `$${i}` : '')+p,'');
                sql=sql.replace('WITH business_scope AS (',`WITH ${fixtures} business_scope AS (`);
                return (await client.query(sql,[...values,JSON.stringify(data)])).rows;
            }},'b');
            assert.equal(result.balance.amount,amount,name);
            assert.equal(result.balance.direction,direction,name);
            assert.equal(result.unresolvedOrderCount,unresolved,name);
            assert.equal(result.canSettle,unresolved===0 && direction!=='SETTLED',name);
            console.log('PASS',name);passed++;
        }
        await check('cash collection leaves 800 receivable',d=>order(d),'800.00','RECEIVE');
        await check('bank payment leaves only courier fee payable',d=>order(d,{cash:0,bank:810}),'10.00','PAY');
        await check('mixed orders offset correctly',d=>{order(d);order(d,{id:'bank',cash:0,bank:810});},'790.00','RECEIVE');
        await check('cash refund to customer does not become courier debt',d=>{order(d,{status:'RETURNED'});d.payments.push({orderId:'o',amount:-800,method:'CASH'});},'800.00','RECEIVE');
        await check('bank refund also leaves courier collection unchanged',d=>{order(d,{status:'RETURNED'});d.payments.push({orderId:'o',amount:-800,method:'BANK_TRANSFER'});},'800.00','RECEIVE');
        await check('partial cash refund leaves courier collection unchanged',d=>{order(d);d.payments.push({orderId:'o',amount:-400,method:'CASH'});},'800.00','RECEIVE');
        await check('receiving settlement closes period',d=>{order(d);settle(d);},'0.00','SETTLED');
        await check('returned settled order stays closed after refund',d=>{order(d,{status:'RETURNED'});settle(d);d.payments.push({orderId:'o',amount:-800,method:'CASH'});},'0.00','SETTLED');
        await check('deleted settled order cannot resurrect 800 payable',d=>{order(d,{deleted:'2026-10-04T10:00:00'});settle(d);},'0.00','SETTLED');
        await check('paying settlement closes bank orders',d=>{order(d,{cash:0,bank:810});settle(d,10);},'0.00','SETTLED');
        await check('new bank order after closed cash period owes only its fee',d=>{order(d);settle(d);order(d,{id:'new',cash:0,bank:810,created:'2026-10-04T10:00:00'});},'10.00','PAY');
        await check('old pending order completed after settlement is included',d=>{order(d);settle(d);order(d,{id:'late',completed:'2026-10-04T10:00:00'});},'800.00','RECEIVE');
        await check('legacy completed order without sale history is closed',d=>{order(d,{completed:null});settle(d);},'0.00','SETTLED');
        await check('unknown payment still prevents settlement',d=>{order(d,{cash:0});d.payments.push({orderId:'o',amount:810,method:'UNKNOWN'});},'0.00','SETTLED',1);
        await check('unpaid and undelivered orders stay outside reminder',d=>order(d,{status:'SHIPPED'}),'0.00','SETTLED');
        await check('other business settlements do not close our period',d=>{order(d);d.settlements.push({businessId:'other',amount:-800,createdAt:'2026-10-03T10:00:00'});},'800.00','RECEIVE');
        await check('historical cost backfill does not reopen settled courier period',d=>{order(d,{completed:'2026-10-04T10:00:00'});d.sales[0].eventKey='cost-resolution:o:initial-sale';d.sales[0].occurredAt='2026-10-02T10:00:00';settle(d);},'0.00','SETTLED');
        await check('pre-start settlements do not close our period',d=>{order(d);settle(d,-800,'2026-09-01T10:00:00');},'800.00','RECEIVE');
        console.log(`${passed} courier regression scenarios passed (read-only).`);
    } finally { await client.query('ROLLBACK');await client.end(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
