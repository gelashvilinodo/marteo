/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const {readPurchase}=require('../lib/material-purchases/input.ts');const {saveMaterialPurchase,actOnPurchase}=require('../lib/material-purchases/store.ts');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});
const {readMaterialInventoryPage}=require('../lib/material-inventory/get-page.ts');
let passed=0;function pass(name){console.log('PASS',name);passed++;}
const rollback=new Error('ROLLBACK');
(async()=>{try{await db.$transaction(async tx=>{
const user=await tx.user.create({data:{email:`qa-inventory-${randomUUID()}@example.invalid`,phone:randomUUID(),password:'unused',status:'ACTIVE'}});
const business=await tx.business.create({data:{name:'QA inventory isolated'}}),foreign=await tx.business.create({data:{name:'QA other isolated'}});
await tx.businessMembership.create({data:{businessId:business.id,userId:user.id,role:'OWNER'}});
const raw=(price,qty='10',defects='0',status='RECEIVED',materialId=null)=>({requestId:randomUUID(),name:'QA batch',note:'',country:'Turkey',purchaseDate:'2026-10-26',receiptStatus:status,shippingCost:'0',customsCost:'0',otherCost:'0',items:[{materialId,name:'QA Cotton',brand:'',description:'',size:'',characteristics:'',category:'Fabric',color:'Cream',unit:'M',quantity:qty,defectiveQuantity:defects,unitPurchasePrice:price}]});
const save=r=>saveMaterialPurchase(tx,business.id,user.id,readPurchase(r),new Map());
const first=await save(raw('8','10','2'));const item=await tx.materialPurchaseItem.findFirst({where:{purchaseId:first.id}});const mid=item.materialId;
await save(raw('12','5','0','RECEIVED',mid));await save(raw('100','100','0','IN_TRANSIT',mid));
const removed=await save(raw('999','1'));const deleted=await tx.materialPurchase.findUnique({where:{id:removed.id}});await actOnPurchase(tx,business.id,user.id,removed.id,deleted.updatedAt.toISOString(),'delete',randomUUID());
await tx.material.create({data:{businessId:foreign.id,name:'Foreign secret',unit:'M',currentStock:'999'}});
let data=await readMaterialInventoryPage(tx,business.id,{});assert.equal(data.count,1);assert.equal(data.items[0].currentStock,'13');assert.equal(data.items[0].defectiveStock,'2');assert.equal(data.items[0].inTransit,'100');pass('received, defects, in-transit and deleted batches separated');
assert.equal(data.items[0].stockValue,'124.00');assert.equal(data.items[0].unitCost,'9.538462');assert.equal(data.items[0].weighted,true);pass('weighted remaining-stock cost excludes transit and defective value');
assert.equal(data.stats.all,1);assert.equal(data.stats.available,1);assert.equal(data.stats.inTransit,1);assert.equal(data.stats.withDefects,1);pass('summary counts material types without mixing units');
data=await readMaterialInventoryPage(tx,business.id,{material:mid});assert.equal(data.lots.length,3);pass('details contain only active scoped lots');
data=await readMaterialInventoryPage(tx,foreign.id,{material:mid});assert.equal(data.material,null);assert.equal(data.lots.length,0);pass('cross-business material ID cannot disclose details');
data=await readMaterialInventoryPage(tx,business.id,{q:'Cream'});assert.equal(data.count,1);data=await readMaterialInventoryPage(tx,business.id,{q:'Foreign secret'});assert.equal(data.count,0);pass('attribute search is scoped');
data=await readMaterialInventoryPage(tx,business.id,{filter:'exhausted'});assert.equal(data.count,0);data=await readMaterialInventoryPage(tx,business.id,{filter:'defective'});assert.equal(data.count,1);pass('stock filters match real stock');
data=await readMaterialInventoryPage(tx,business.id,{page:'99999999',lotPage:'99999999',material:mid});assert.equal(data.page,1);assert.equal(data.lotPage,1);pass('out-of-range pages clamped');
const onlyTransit=await save({...raw('5','2','0','IN_TRANSIT'),items:[{...raw('5').items[0],name:'Pending only',quantity:'2'}]});const pendingItem=await tx.materialPurchaseItem.findFirst({where:{purchaseId:onlyTransit.id}});
data=await readMaterialInventoryPage(tx,business.id,{q:'Pending only'});assert.equal(data.items[0].currentStock,'0');assert.equal(data.items[0].unitCost,null);assert.equal(data.items[0].stockValue,null);assert.equal(data.items[0].inTransit,'2');assert.equal(data.items[0].id,pendingItem.materialId);pass('transit-only stock has no available quantity or cost');
await tx.materialPurchaseItem.update({where:{id:item.id},data:{remainingQuantity:'5',remainingCost:'40'}});await tx.material.update({where:{id:mid},data:{currentStock:'8'}});
data=await readMaterialInventoryPage(tx,business.id,{q:'QA Cotton'});assert.equal(data.items[0].stockValue,'84.00');assert.equal(data.items[0].unitCost,'10.500000');pass('partly consumed lots use remaining cost and quantity');
const many=Array.from({length:21},(_,i)=>({id:randomUUID(),businessId:business.id,name:`Pagination ${i}`,unit:'M',currentStock:'1'}));await tx.material.createMany({data:many});await tx.materialPurchaseItem.createMany({data:many.map(m=>({purchaseId:first.id,materialId:m.id,name:m.name,snapshot:{},quantity:'1',defectiveQuantity:'0',remainingQuantity:'1',unitPurchasePrice:'1',allocatedCost:'0',totalCost:'1',remainingCost:'1',finalUnitCost:'1'}))});
data=await readMaterialInventoryPage(tx,business.id,{q:'Pagination',page:'2'});assert.equal(data.count,21);assert.equal(data.pages,2);assert.equal(data.items.length,1);pass('pagination returns the final page without duplicates');
throw rollback;
},{timeout:60000});}catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(`${passed} checks passed; all fixtures rolled back.`);})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
