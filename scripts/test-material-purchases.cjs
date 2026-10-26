/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const {readPurchase,calculate}=require('../lib/material-purchases/input.ts');const {saveMaterialPurchase,actOnPurchase}=require('../lib/material-purchases/store.ts');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});
let passed=0;const pass=name=>{console.log('PASS',name);passed++;};
const raw=()=>({requestId:randomUUID(),name:'QA fabric batch',country:'Turkey',note:'test',purchaseDate:'2026-10-26',receiptStatus:'RECEIVED',shippingCost:'10',customsCost:'0',otherCost:'0',items:[{materialId:null,name:'Cotton',brand:'QA',category:'Fabric',description:'Cotton fabric',color:'Cream',size:'150cm',characteristics:'100% cotton',unit:'M',quantity:'12.5',defectiveQuantity:'0.5',unitPurchasePrice:'8'}]});
const rollback=new Error('ROLLBACK_MATERIAL_QA');
(async()=>{try{
 let r=raw(),c=calculate(readPurchase(r));assert.equal(c.total.toString(),'110');assert.equal(c.rows[0].finalUnitCost.toString(),'8.8');pass('fractional material and shipping allocation');
 const invalid=[{label:'zero quantity',change:r=>r.items[0].quantity='0'},{label:'negative price',change:r=>r.items[0].unitPurchasePrice='-1'},{label:'fractional pieces',change:r=>r.items[0].unit='PCS'},{label:'defects exceed quantity',change:r=>r.items[0].defectiveQuantity='13'},{label:'invalid date',change:r=>r.purchaseDate='2026-99-99'},{label:'excess precision',change:r=>r.items[0].quantity='0.1234567'},{label:'unknown unit',change:r=>r.items[0].unit='CUSTOM'}];
 for(const test of invalid){r=raw();test.change(r);assert.throws(()=>readPurchase(r));pass(test.label+' rejected');}
 r=raw();r.shippingCost='0.01';r.items=[...Array(3)].map((_,i)=>({...r.items[0],name:'test'+i,quantity:'1',defectiveQuantity:'0',unitPurchasePrice:'1'}));c=calculate(readPurchase(r));assert.equal(c.rows.reduce((s,i)=>s.plus(i.allocatedCost),new (require('../generated/prisma/browser.ts').Prisma.Decimal)(0)).toFixed(2),'0.01');pass('rounding conserves every allocated cent');
 await db.$transaction(async tx=>{
 const user=await tx.user.create({data:{email:`qa-material-${randomUUID()}@example.invalid`,phone:randomUUID(),password:'unused',status:'ACTIVE'}});
 const business=await tx.business.create({data:{name:'QA material isolated'}}),bid=business.id;
 const other=await tx.business.create({data:{name:'QA other isolated'}});
 await tx.businessMembership.create({data:{userId:user.id,businessId:bid,role:'OWNER'}});
 await tx.businessMembership.create({data:{userId:user.id,businessId:other.id,role:'MEMBER'}});
 const save=(input,edit)=>saveMaterialPurchase(tx,bid,user.id,readPurchase(input),new Map(),edit);
 r=raw();let result=await save(r);let batch=await tx.materialPurchase.findUnique({where:{id:result.id},include:{items:true}});let material=await tx.material.findUnique({where:{id:batch.items[0].materialId}});
 assert.equal(material.currentStock.toString(),'12');assert.equal(batch.items[0].totalCost.toString(),'110');assert.equal(batch.items[0].snapshot.color,'Cream');pass('received stock excludes defects and saves characteristics');
 const replay=await save(r);assert.equal(replay.id,batch.id);assert.equal(await tx.materialPurchase.count({where:{businessId:bid}}),1);assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'12');pass('create retry does not duplicate stock or batch');
 const editRaw={...raw(),country:'TURKEY',shippingCost:'20',items:[{...r.items[0],materialId:material.id,quantity:'20',defectiveQuantity:'0'}]};
 const version=batch.updatedAt.toISOString();await save(editRaw,{id:batch.id,version});batch=await tx.materialPurchase.findUnique({where:{id:batch.id},include:{items:true}});
 assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'20');assert.equal(batch.country,'Turkey');assert.equal(batch.items[0].totalCost.toString(),'180');pass('edit reverses only original stock and normalizes remembered country');
 await save(editRaw,{id:batch.id,version});assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'20');pass('edit retry idempotent despite original version');
 await assert.rejects(()=>save({...editRaw,requestId:randomUUID()},{id:batch.id,version}),/შეიცვალა/);pass('stale edit rejected');
 const pending={...raw(),receiptStatus:'IN_TRANSIT',items:[{...r.items[0],materialId:material.id,quantity:'2',defectiveQuantity:'0'}]};const transit=await save(pending);let t=await tx.materialPurchase.findUnique({where:{id:transit.id}});assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'20');
 const receiveId=randomUUID();await actOnPurchase(tx,bid,user.id,t.id,t.updatedAt.toISOString(),'receive',receiveId);await actOnPurchase(tx,bid,user.id,t.id,t.updatedAt.toISOString(),'receive',receiveId);assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'22');pass('in-transit stock becomes available exactly once on receipt');
 t=await tx.materialPurchase.findUnique({where:{id:t.id}});const deleteId=randomUUID();await actOnPurchase(tx,bid,user.id,t.id,t.updatedAt.toISOString(),'delete',deleteId);await actOnPurchase(tx,bid,user.id,t.id,t.updatedAt.toISOString(),'delete',deleteId);assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'20');pass('delete retry reverses only this batch once');
 const foreign=await tx.material.create({data:{businessId:other.id,name:'Other material',unit:'M'}});
 await assert.rejects(()=>save({...raw(),items:[{...r.items[0],materialId:foreign.id}]}),/ბიზნესში/);pass('cross-business material ID rejected');
 await assert.rejects(()=>saveMaterialPurchase(tx,other.id,user.id,readPurchase(raw()),new Map()),/უფლება/);pass('member write permission rejected');
 await assert.rejects(()=>save({...raw(),items:[{...r.items[0],materialId:material.id,unit:'KG'}]}),/ერთეულის/);pass('existing material unit immutable');
 await tx.materialPurchaseItem.update({where:{id:batch.items[0].id},data:{remainingQuantity:'19'}});
 await assert.rejects(()=>save({...editRaw,requestId:randomUUID()},{id:batch.id,version:batch.updatedAt.toISOString()}),/გამოყენებულია/);pass('consumed lot cannot be overwritten');
 assert.equal(await tx.purchase.count({where:{businessId:bid}}),0);assert.equal(await tx.inventoryItem.count({where:{businessId:bid}}),0);pass('retail purchase and product-stock tables untouched');
 throw rollback;
 },{isolationLevel:'Serializable',timeout:60000});
 }catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(`${passed} checks passed; fixtures rolled back; no photos uploaded.`);})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
