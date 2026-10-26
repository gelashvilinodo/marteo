/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let activeMembership=null;
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id==='@/lib/auth/current-business')return {getCurrentBusiness:async()=>activeMembership};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const {readPurchase}=require('../lib/material-purchases/input.ts');const {saveMaterialPurchase,actOnPurchase}=require('../lib/material-purchases/store.ts');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});
const {readProduction,outputCosts}=require('../lib/production/input.ts');
const {saveProduction}=require('../lib/production/store.ts');
const {allocateStockLots}=require('../lib/orders/allocate-stock-lots.ts');
const {Prisma}=require('../generated/prisma/client.ts');

const {hasBusinessFeature,isBusinessMode}=require('../lib/business/business-mode.ts');
const {validateBusinessSettings}=require('../lib/business/business-settings.ts');
const {businessFeatureDenied,requireBusinessFeature}=require('../lib/business/feature-access.ts');
let passed=0;const pass=name=>{console.log('PASS',name);passed++;};const rollback=new Error('ROLLBACK');
(async()=>{try{
for(const [mode,imports,manufacturing]of [['IMPORT',true,false],['MANUFACTURING',false,true],['HYBRID',true,true]]){assert.equal(hasBusinessFeature(mode,'imports'),imports);assert.equal(hasBusinessFeature(mode,'manufacturing'),manufacturing);pass(mode+' feature matrix');}
assert.equal(isBusinessMode('unexpected'),false);assert.throws(()=>validateBusinessSettings({name:'QA',phone:'',mode:'INVALID',expectedUpdatedAt:new Date().toISOString()}),/მიმართულება/);pass('invalid business direction rejected');
assert.equal(validateBusinessSettings({name:'QA',phone:'',mode:'MANUFACTURING',expectedUpdatedAt:new Date().toISOString()}).mode,'MANUFACTURING');pass('settings accept explicit valid mode');
for(const [mode,deniedFeature,allowedFeature]of [['IMPORT','manufacturing','imports'],['MANUFACTURING','imports','manufacturing']]){activeMembership={business:{mode}};const denial=await businessFeatureDenied(deniedFeature);assert.equal(denial.status,403);assert.equal((await denial.json()).success,false);assert.equal(await businessFeatureDenied(allowedFeature),null);await assert.rejects(()=>requireBusinessFeature(deniedFeature),e=>e.digest?.includes('/dashboard/business-settings'));pass(mode+' API denial and direct-page redirect');}
activeMembership={business:{mode:'HYBRID'}};assert.equal(await businessFeatureDenied('imports'),null);assert.equal(await businessFeatureDenied('manufacturing'),null);pass('hybrid permits both feature groups');

function routes(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?routes(path.join(dir,e.name)):e.name==='route.ts'?[path.join(dir,e.name)]:[]);}
for(const [directory,mode]of [['purchases','MANUFACTURING'],['material-purchases','IMPORT'],['production','IMPORT']]){
 activeMembership={business:{mode}};
 for(const file of routes(path.join(root,'app/api',directory))){const handlers=require(file);for(const verb of ['GET','POST','PATCH','DELETE','PUT'])if(handlers[verb]){const response=await handlers[verb](new Request('http://localhost:3000/api/'+directory,{method:verb}),{params:Promise.resolve({purchaseId:'not-a-record',action:'delete'})});assert.equal(response.status,403);pass(path.relative(root,file)+' '+verb+' denies incompatible mode before work');}}
}
await db.$transaction(async tx=>{
const b=await tx.business.create({data:{name:'QA mode isolated'}});assert.equal(b.mode,'IMPORT');pass('existing/default-compatible import database default');
const material=await tx.material.create({data:{businessId:b.id,name:'QA preserved material',unit:'M',currentStock:'2.5'}});
const product=await tx.product.create({data:{businessId:b.id,name:'QA preserved product'}});
for(const mode of ['MANUFACTURING','HYBRID','IMPORT']){await tx.business.update({where:{id:b.id},data:{mode}});assert.equal((await tx.material.findUnique({where:{id:material.id}})).currentStock.toString(),'2.5');assert.equal((await tx.product.findUnique({where:{id:product.id}})).name,'QA preserved product');}pass('switching through all modes preserves material and product data');
await assert.rejects(()=>require('../lib/orders/material-stock.ts').consumeOrderMaterial(tx,b.id,material.id,1),e=>e.status===403);pass('forged new material sale rejected for import mode');
throw rollback;
},{timeout:30000});
}catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(`${passed} checks passed; fixtures rolled back.`);})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
