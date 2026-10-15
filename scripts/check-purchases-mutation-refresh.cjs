const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Decimal } = require('@prisma/client-runtime-utils');
function load(path, mocks) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
        {exports,require:id=>{if(id==='server-only')return {};if(!(id in mocks))throw Error(id);return mocks[id];},URL,Response,Date,Map,console});
    return exports;
}
(async()=>{
    let count=11,disconnected=0,fail=false;const queries=[];
    const inventory={id:'inv',imageUrl:null,color:'black',size:null,product:{name:'Bag',category:'bags',brand:null}};
    const purchase={id:'p',number:7,name:'Batch',note:null,receiptStatus:'RECEIVED',archivedAt:null,purchaseDate:new Date('2026-10-01T00:00:00Z'),shippingCost:new Decimal('0.10'),customsCost:new Decimal('0.20'),otherCost:new Decimal('0'),
        items:[{id:'item',quantity:3,defectiveQuantity:1,remainingQuantity:3,remainingDefectiveQuantity:1,defectNote:'scratch',unitPurchasePrice:new Decimal('0.10'),finalUnitCost:new Decimal('0.20'),_count:{orderAllocations:0,inventoryMovements:0},inventoryItem:inventory}]};
    const tx={purchase:{count:async args=>{queries.push(['count',args]);return count;},findMany:async args=>{queries.push(['list',args]);if(fail)throw Error('read failed');return [purchase];}},
        inventoryItem:{findMany:async args=>{queries.push(['inventory',args]);return [{...inventory,productId:'prod',sku:'SKU',currentStock:3,pricingMethod:'MANUAL',pricingValue:null,salePrice:new Decimal('1.20'),purchaseItems:[{unitPurchasePrice:new Decimal('0.10')}]}];}},
        purchaseItem:{groupBy:async args=>{queries.push(['defects',args]);return [{inventoryItemId:'inv',_sum:{remainingDefectiveQuantity:1}}];}},
        productAttribute:{findMany:async args=>{queries.push(['attributes',args]);return [{type:'COLOR',name:'black'}];}},product:{findMany:async args=>{queries.push(['products',args]);return [{name:'Bag'}];}}};
    const helper=load('lib/purchases/get-purchases-snapshot.ts',{'@/generated/prisma/client':{Prisma:{Decimal,TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'}}},'@/lib/prisma':{createPrismaClient:()=>({$transaction:async(callback,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');return callback(tx);},$disconnect:async()=>{disconnected++;}})}});
    const data=await helper.getPurchasesSnapshot('business-A',{view:'archive',q:'#007',from:'2026-10-01',to:'2026-10-02',page:'9'});
    assert.equal(data.currentPage,2);assert.equal(data.totalPages,2);assert.equal(data.purchases[0].productsCost,'0.30');assert.equal(data.purchases[0].totalCost,'0.60');
    assert.equal(data.purchases[0].items[0].remainingDefectiveQuantity,1);assert.equal(data.inventoryOptions[0].currentStock,2);assert.equal(data.inventoryOptions[0].pricingValue,'1.2');
    assert.equal(data.inventoryOptions[0].unitPurchasePrice,'0.1');assert.equal(data.attributeOptions.color[0],'black');
    assert.doesNotThrow(()=>JSON.stringify(data));assert.equal(typeof data.purchases[0].purchaseDate,'string');
    const where=queries[0][1].where;assert.equal(where.businessId,'business-A');assert.deepEqual(JSON.parse(JSON.stringify(where.archivedAt)),{not:null});assert.equal(where.OR.at(-1).number,7);
    assert.equal(where.purchaseDate.gte.toISOString(),'2026-09-30T20:00:00.000Z');assert.equal(where.purchaseDate.lt.toISOString(),'2026-10-02T20:00:00.000Z');
    assert.equal(queries[1][1].skip,10);assert.equal(queries[1][1].take,10);
    assert.equal(queries[2][1].where.businessId,'business-A');assert.equal(queries[2][1].where.purchaseItems.some.purchase.receiptStatus,'RECEIVED');
    assert.equal(queries[3][1].where.purchase.businessId,'business-A');assert.equal(queries[3][1].where.inventoryItem.businessId,'business-A');
    assert.equal(queries[4][1].where.businessId,'business-A');assert.equal(queries[5][1].where.businessId,'business-A');
    queries.length=0;count=0;const invalid=await helper.getPurchasesSnapshot('business-A',{from:'2026-02-30',page:'-1'});assert.ok(invalid.filterError);assert.equal(invalid.currentPage,1);assert.equal(queries[0][1].where.id.in.length,0);
    fail=true;await assert.rejects(helper.getPurchasesSnapshot('business-A',{}),/read failed/);assert.equal(disconnected,3);
    let user=null,membership=null,reads=0;
    const route=load('app/api/purchases/list/route.ts',{'@/lib/auth/session':{getCurrentUser:async()=>user},'@/lib/auth/current-business':{getCurrentBusiness:async()=>membership},'@/lib/purchases/get-purchases-snapshot':{getPurchasesSnapshot:async(id,p)=>{reads++;assert.equal(id,'authorized');assert.equal(p.view,'archive');return data;}},'@/lib/orders/order-http':{orderJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})}});
    const request={url:'https://marteo.ge/api/purchases/list?view=archive&businessId=attacker'};
    assert.equal((await route.GET(request)).status,401);user={id:'user'};assert.equal((await route.GET(request)).status,403);assert.equal(reads,0);
    membership={businessId:'authorized'};const response=await route.GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    const source=fs.readFileSync('components/dashboard/purchases/PurchasesView.tsx','utf8');const ast=ts.createSourceFile('view.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
    function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes('window.addEventListener(PURCHASES_CHANGED'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(effect);
    const target=new EventTarget();const requests=[];let applied,error,loading;
    const window={addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target),dispatchEvent:target.dispatchEvent.bind(target),location:{search:'?view=archive&q=Bag&from=2026-10-01&page=9',hash:'#list'},history:{state:{keep:true},replaceState(state,_,url){this.last={state,url};}}};
    const context={window,Event,AbortController,URLSearchParams,setTimeout,clearTimeout,PURCHASES_CHANGED:'marteo:purchases-changed',setRefreshing:v=>{loading=v;},setError:v=>{error=v;},setSnapshot:v=>{applied=v;},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))};
    const cleanup=vm.runInNewContext(ts.transpileModule(`const subscribe=${effect};subscribe();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
    const emit=()=>window.dispatchEvent(new Event(context.PURCHASES_CHANGED,{cancelable:true}));const tick=()=>new Promise(r=>setTimeout(r,5));
    emit();emit();await tick();assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/purchases/list'+window.location.search);
    emit();await tick();assert.equal(requests[0].options.signal.aborted,true);
    requests[0].resolve({ok:true,json:async()=>({success:true,data})});await tick();assert.equal(applied,undefined);
    requests[1].resolve({ok:true,json:async()=>({success:true,data})});await tick();assert.equal(applied,data);assert.equal(loading,false);assert.match(window.history.last.url,/view=archive&q=Bag&from=2026-10-01&page=2#list/);assert.equal(window.history.last.state.keep,true);
    emit();await tick();requests[2].resolve({ok:false,json:async()=>({message:'failed'})});await tick();assert.equal(error,'failed');assert.equal(applied,data);
    emit();await tick();window.location.search='?q=other';requests[3].resolve({ok:true,json:async()=>({success:true,data:{...data,currentPage:1}})});await tick();assert.equal(applied,data,'Navigation rejects old response');
    emit();await tick();cleanup();assert.equal(requests[4].options.signal.aborted,true);assert.equal(emit(),true);
    const client={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/purchases/refresh-purchases-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:client,window,Event});let fallback=0;client.refreshPurchasesAfterMutation(()=>fallback++);assert.equal(fallback,1);
    console.log('PASS: exact money, stock/defect options, tenant/archive/search/date scope, page clamp, serialization, repeatable read and cleanup, auth/no-store, coalescing, stale/navigation responses, failed-read preservation and fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
