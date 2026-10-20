/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CJS test loader for the TypeScript import validators. */
const fs=require('fs'),Module=require('module'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const old=Module._load;Module._load=function(id,parent,...args){if(id.startsWith('@/'))return old.call(this,root+'/'+id.slice(2),parent,...args);return old.call(this,id,parent,...args)};
const {discoverImportSources,createDiscoveredMappings}=require(root+'/lib/imports/discover-import-sources.ts');
const sheet=(name,rows)=>({name,hidden:false,mergedRanges:[],rows:rows.map((values,i)=>({rowNumber:i+1,cells:values.map((value,c)=>({address:String.fromCharCode(65+c)+(i+1),value,displayText:null,formula:null,errorCode:null,numberFormat:null}))}))});
const file=(...sheets)=>({sha256:'a'.repeat(64),originalName:'test.xlsx',format:'xlsx',excelDateSystem:'1900',sheets,issues:[]});
const {prepareImportCustomers}=require(root+'/lib/imports/prepare-import-customers.ts');
const {prepareImportProducts}=require(root+'/lib/imports/prepare-import-products.ts');
let tests=0;function test(name,fn){try{fn();tests++;console.log('PASS',name)}catch(e){console.error('FAIL',name);throw e}}
const mixed=file(sheet('Data',[['order code','date','product name','quantity','unit price','phone','address'],['O1','2026-10-01','Cup',2,'20','555000001','Tbilisi']]));
test('one sheet can provide orders and contacts without checkboxes',()=>{const d=discoverImportSources(mixed);assert(d.some(s=>s.category==='orders'));assert(d.some(s=>s.category==='customers'));const m=createDiscoveredMappings(mixed);assert(m.orders.Data.enabled);assert(m.customers.Data.enabled);assert.equal(m.products.Data,undefined)});
const customer=file(sheet('მომხმარებლები',[['name'],['ანა']]));
test('incomplete customer sheet remains discoverable',()=>{assert.deepEqual(discoverImportSources(customer)[0].missing,['ტელეფონი','მისამართი'])});
test('missing entire phone/address columns retains editable rows',()=>{const m=createDiscoveredMappings(customer);const r=prepareImportCustomers([{fileId:'f',fileName:'test',sheet:customer.sheets[0],mapping:m.customers['მომხმარებლები'],edits:{}}]);assert.equal(r.records.length,1);assert.equal(r.records[0].status,'INVALID');assert.equal(r.records[0].input.firstName,'ანა');assert.equal(r.mappingProblems.length,0)});
test('edits fill absent source columns without fabricating data',()=>{const m=createDiscoveredMappings(customer);const r=prepareImportCustomers([{fileId:'f',fileName:'test',sheet:customer.sheets[0],mapping:m.customers['მომხმარებლები'],edits:{2:{phone:'555000001',address:'Tbilisi'}}}]);assert.equal(r.records[0].status,'READY');assert.equal(r.records[0].data.firstName,'ანა')});
test('dedicated contact sheet preferred over repeated contacts in orders',()=>{const f=file(...mixed.sheets,sheet('customers',[['phone','address'],['555000001','Tbilisi']]));const m=createDiscoveredMappings(f);assert.equal(m.customers.Data.enabled,false);assert.equal(m.customers.customers.enabled,true)});
test('header row found after introductory title',()=>{const f=file(sheet('stock',[['Company report'],['name','current stock','unit cost'],['Cup',5,12]]));assert.equal(discoverImportSources(f).find(v=>v.category==='products').headerRowNumber,2)});
test('product stock selects current balance mode',()=>{const f=file(sheet('stock',[['name','current stock','unit cost'],['Cup',5,12]]));assert.equal(createDiscoveredMappings(f).products.stock.mode,'CURRENT_STOCK')});
test('empty sheets are not offered for import',()=>assert.equal(discoverImportSources(file(sheet('customers',[['phone','address']]))).length,0));
test('unrelated sheet is not invented as business data',()=>assert.equal(discoverImportSources(file(sheet('notes',[['weather','temperature'],['sunny',20]]))).length,0));
test('missing product name column can be filled inline',()=>{const f=file(sheet('stock',[['sku','current stock'],['P1',5]]));const m=createDiscoveredMappings(f);const source={fileId:'f',fileName:'test',sheet:f.sheets[0],mapping:m.products.stock,edits:{2:{name:'Cup'}}};const r=prepareImportProducts([source]);assert.equal(r.mappingProblems.length,0);assert.equal(r.records[0].status,'READY')});

const {validatePartialImportSettings}=require(root+'/lib/imports/validate-partial-import-settings.ts');
const {getOrderCustomerDecisionToken}=require(root+'/lib/imports/order-customer-decisions.ts');
const {linkOrderCustomersFromImport}=require(root+'/lib/imports/link-order-customers-from-import.ts');
const base={workspaceVersion:1,customerMappings:{},customerEdits:{},excludedCustomerKeys:[],existingCustomerLinks:{}};
const completed={customers:true,products:false,orders:false};
test('partial draft allows corrections to unfinished orders',()=>{const result=validatePartialImportSettings({savedSettings:base,nextSettings:{...base,orderEdits:{'00000000-0000-4000-8000-000000000001':{orders:{2:{name:'Cup'}}}}},completed,businessId:'b'});assert.equal(result.orderEdits['00000000-0000-4000-8000-000000000001'].orders[2].name,'Cup')});
test('completed customer settings cannot be overwritten',()=>assert.throws(()=>validatePartialImportSettings({savedSettings:base,nextSettings:{...base,excludedCustomerKeys:[JSON.stringify(['00000000-0000-4000-8000-000000000001','customers',2])]},completed,businessId:'b'})));
const phone='+995555000001';
const candidate={phone,orderKeys:['o'],variants:[{key:'v',orderKeys:['o'],data:{phone,address:'Tbilisi',firstName:null,lastName:null}}],matches:[{id:'c1',normalizedPhone:phone,phone,firstName:null,lastName:null,address:'Tbilisi',deletedAt:null,updatedAt:'2026-10-20T00:00:00.000Z'}]};
const imported=[{normalizedData:{phone},result:{action:'CREATE',customerId:'c1'}}];
const link=(decisions={},records=imported,candidates=[candidate])=>linkOrderCustomersFromImport({businessId:'b',candidates,decisions,imported:records});
test('orders reuse customer created by same import',()=>assert.equal(link()[phone].customerId,'c1'));
test('ordinary existing customer still requires an explicit choice',()=>assert.deepEqual(link({},[]),{}));
test('explicit skip always wins over same-import link',()=>{const decision={action:'SKIP',token:getOrderCustomerDecisionToken(candidate)};assert.deepEqual(link({[phone]:decision})[phone],decision)});
test('stale choice is never silently replaced',()=>{const decision={action:'CREATE',token:'stale',variantKey:'v'};assert.deepEqual(link({[phone]:decision})[phone],decision)});
test('archived customer cannot be automatically linked',()=>assert.deepEqual(link({},imported,[{...candidate,matches:[{...candidate.matches[0],deletedAt:'2026-10-20T00:00:00.000Z'}]}]),{}));


const {getOrderImportNeeds}=require(root+'/lib/imports/get-order-import-needs.ts');
const {createOrderImportOptions}=require(root+'/lib/imports/order-import-options.ts');
test('purchase sheet is not misclassified as sales',()=>{const f=file(sheet('პარტიები',[['date','sku','quantity','unit price','line total'],['2026-10-01','P1',5,10,50]]));assert.equal(discoverImportSources(f).length,0)});
test('customer name/code are not mistaken for product catalog',()=>{const f=file(sheet('მომხმარებლები',[['კოდი','ტელეფონი','სახელი','მისამართი'],['C1','555000001','ანა','თბილისი']]));assert.deepEqual(discoverImportSources(f).map(v=>v.category),['customers'])});
test('known order fields do not ask for redundant common rules',()=>{
 const f=file(sheet('orders',[['order code','date','product name','quantity','unit price','status','payment status','payment date'],['O1','2026-10-01','Cup',1,20,'completed','paid','2026-10-01']]));
 const settings={...base,orderMappings:{f:createDiscoveredMappings(f).orders},orderOptions:createOrderImportOptions()};
 assert.deepEqual(getOrderImportNeeds([{clientFileId:'f',file:f}],settings),{status:false,payment:false,grouping:false,date:false,dateOrder:false,paymentDate:false});
});
test('missing order status/payment prompts common choices',()=>{
 const f=file(sheet('orders',[['order code','date','product name','quantity','unit price'],['O1','2026-10-01','Cup',1,20]]));
 const settings={...base,orderMappings:{f:createDiscoveredMappings(f).orders},orderOptions:createOrderImportOptions()};
 const needs=getOrderImportNeeds([{clientFileId:'f',file:f}],settings);assert.equal(needs.status,true);assert.equal(needs.payment,true);assert.equal(needs.grouping,false);
});


test('skipping contacts also skips implicit customer creation by orders',()=>{const decisions=linkOrderCustomersFromImport({businessId:'b',candidates:[candidate],decisions:{},imported,skipCustomers:true});assert.equal(decisions[phone].action,'SKIP');assert.equal(decisions[phone].token,getOrderCustomerDecisionToken(candidate))});
test('comma decimals are detected from price columns',()=>{const f=file(sheet('products',[['product name','sale price','current stock'],['Cup','12,50',2]]));assert.equal(createDiscoveredMappings(f).products.products.decimalSeparator,',')});


test('generic name/code does not silently create products from ambiguous contacts',()=>{const f=file(sheet('Sheet1',[['name','code'],['Ana','C1']]));assert.equal(discoverImportSources(f).length,0)});
const {buildProductImportPlan}=require(root+'/lib/imports/build-product-import-plan.ts');
const {getProductStockDateReview}=require(root+'/lib/imports/product-stock-date-review.ts');
function stockDateReview({date=null,exclude=false,mode='CURRENT_STOCK'}={}){
 const f=file(sheet('products',[['product name','current stock'],['Cup',5]]));
 const mapping={...createDiscoveredMappings(f).products.products,mode};
 const source={fileId:'f',fileName:'test',sheet:f.sheets[0],mapping,edits:{}};
 const prepared=prepareImportProducts([source]);
 const records=exclude?[]:prepared.records;
 return getProductStockDateReview(buildProductImportPlan({records,snapshot:null,decisions:{},stockDate:date}),date,null);
}
test('stock date is required before an existing-product check succeeds',()=>{const r=stockDateReview();assert.equal(r.affectedCount,1);assert(r.error)});
test('valid shared stock date clears the navigation blocker',()=>assert.equal(stockDateReview({date:'2026-10-20'}).error,null));
test('impossible stock date remains blocked',()=>assert(stockDateReview({date:'2026-02-30'}).error));
test('skipped stock rows do not block navigation',()=>assert.deepEqual(stockDateReview({exclude:true}),{affectedCount:0,error:null}));
test('catalog-only products do not require a stock date',()=>assert.deepEqual(stockDateReview({mode:'CATALOG'}),{affectedCount:0,error:null}));
const {prepareImportOrderGroup}=require(root+'/lib/imports/prepare-import-order-group.ts');
const groupOptions={...createOrderImportOptions(),missingStatus:'COMPLETED',missingPayment:'PAID',paymentDateMode:'ORDER_DATE'};
const orderRow=(rowNumber,input)=>({key:String(rowNumber),fileId:'f',fileName:'f.xlsx',sheetName:'s',rowNumber,input,issues:[],decimalSeparator:'.',excelDateSystem:'1900'});
const groupA=orderRow(2,{name:'A',quantity:2,unitPrice:'30',unitCost:'12',date:'2026-10-18',orderTotal:'80',paidAmount:'80'});
const groupB=orderRow(3,{name:'B',quantity:1,unitPrice:'20',unitCost:'8',orderTotal:'80',paidAmount:'80'});
const group=(rows,patch={})=>prepareImportOrderGroup({rows,options:{...groupOptions,...patch}});
test('multi-line order counts repeated order total once',()=>{const r=group([groupA,groupB]);assert.equal(r.kind,'PREVIEW_READY');assert.equal(r.data.totals.payableTotal,'80.00');assert.equal(r.data.payment.paidAmount,'80.00');assert.equal(r.data.totalCost,'32.00')});
test('missing one line cost preserves the order with unknown cost',()=>assert.equal(group([groupA,{...groupB,input:{...groupB.input,unitCost:null}}]).data.totalCost,null));
test('conflicting dates in one order require review',()=>assert.equal(group([groupA,{...groupB,input:{...groupB.input,date:'2026-10-19'}}]).kind,'NEEDS_REVIEW'));
test('conflicting repeated totals require review',()=>assert.equal(group([groupA,{...groupB,input:{...groupB.input,orderTotal:'90'}}]).kind,'NEEDS_REVIEW'));
test('missing product quantity cannot be imported',()=>assert.equal(group([groupA,{...groupB,input:{...groupB.input,quantity:null}}]).kind,'NEEDS_REVIEW'));
test('no courier amount or fallback is required for historical orders',()=>assert.equal(group([groupA,groupB],{fallbackCourierFee:null}).kind,'PREVIEW_READY'));
test('canceled orders are skipped',()=>assert.equal(group([{...groupA,input:{...groupA.input,status:'canceled'}}]).kind,'SKIPPED'));
test('conflicting canceled/completed lines cannot silently become one completed order',()=>assert.equal(group([{...groupA,input:{...groupA.input,status:'canceled'}},{...groupB,input:{...groupB.input,status:'completed'}}]).kind,'NEEDS_REVIEW'));
test('unknown payment remains unknown for an active order',()=>{const r=group([{...groupA,input:{...groupA.input,orderTotal:null,paidAmount:null}}],{missingStatus:'PROCESSING',missingPayment:'UNRESOLVED'});assert.equal(r.kind,'PREVIEW_READY');assert.equal(r.data.payment.kind,'UNKNOWN')});
test('completed order with unknown payment cannot silently be saved',()=>assert.equal(group([{...groupA,input:{...groupA.input,orderTotal:null,paidAmount:null}}],{missingPayment:'UNRESOLVED'}).kind,'NEEDS_REVIEW'));
console.log(tests+' import workflow checks passed; no database writes');
