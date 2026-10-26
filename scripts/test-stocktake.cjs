/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});

const {getStocktakeDocument}=require('../lib/inventory/stocktake/get-document.ts');
const {createStocktakePdf}=require('../lib/inventory/stocktake/create-pdf.ts');
const {PDFDocument}=require('pdf-lib');
let passed=0;const pass=n=>{passed++;console.log('PASS',n);};const rollback=new Error('ROLLBACK');
(async()=>{try{await db.$transaction(async tx=>{
 const business=await tx.business.create({data:{name:'სატესტო ბიზნესი',mode:'HYBRID'}}),other=await tx.business.create({data:{name:'Foreign'}}),bid=business.id;
 const purchase=await tx.materialPurchase.create({data:{businessId:bid,number:1,requestId:randomUUID(),purchaseDate:new Date(),shippingCost:0,customsCost:0,otherCost:0,createdById:'QA',updatedById:'QA'}});
 for(let i=0;i<26;i++){
  const p=await tx.product.create({data:{businessId:bid,name:'პროდუქტი '+String(i).padStart(2,'0'),category:i<3?'არჩეული':'სხვა'}});
  const inventory=await tx.inventoryItem.create({data:{businessId:bid,productId:p.id,sku:'QA-'+i,currentStock:5}});
  await tx.inventoryStockLot.create({data:{inventoryItemId:inventory.id,quantity:5,remainingQuantity:5,defectiveQuantity:1,remainingDefectiveQuantity:1,unitCost:2,remainingCost:10,availableAt:new Date()}});
  const m=await tx.material.create({data:{businessId:bid,name:'მასალა '+String(i).padStart(2,'0'),unit:'M',currentStock:'2.5',color:i<2?'შავი':'თეთრი'}});
  await tx.materialPurchaseItem.create({data:{purchaseId:purchase.id,materialId:m.id,name:m.name,snapshot:{name:m.name,unit:'M'},quantity:'3',defectiveQuantity:'0.5',remainingQuantity:'3',unitPurchasePrice:2,allocatedCost:0,totalCost:6,remainingCost:6,finalUnitCost:2}});
 }
 const foreign=await tx.product.create({data:{businessId:other.id,name:'Must not leak'}});const fi=await tx.inventoryItem.create({data:{businessId:other.id,productId:foreign.id,sku:'FOREIGN',currentStock:10}});await tx.inventoryStockLot.create({data:{inventoryItemId:fi.id,quantity:10,remainingQuantity:10,unitCost:1,remainingCost:10,availableAt:new Date()}});
 let doc=await getStocktakeDocument(tx,bid,new URLSearchParams('kind=products&scope=all&page=2&q=DO-NOT-MATCH'));assert.equal(doc.rows.length,26);assert.equal(doc.rows.some(r=>r.name==='Must not leak'),false);assert.equal(doc.rows[0].quantity,'5');assert.equal(doc.rows[0].defective,'1');pass('all product pages exported, unrelated filters ignored, business scoped');
 doc=await getStocktakeDocument(tx,bid,new URLSearchParams('kind=products&scope=filtered&category='+encodeURIComponent('არჩეული')+'&page=2'));assert.equal(doc.rows.length,3);pass('filtered products use existing category filter across every page');
 doc=await getStocktakeDocument(tx,bid,new URLSearchParams('kind=materials&scope=all'));assert.equal(doc.rows.length,26);assert.equal(doc.rows[0].quantity,'3');assert.equal(doc.rows[0].defective,'0.5');pass('fractional materials include physical defective stock without mixing units');
 doc=await getStocktakeDocument(tx,bid,new URLSearchParams('kind=materials&scope=filtered&q='+encodeURIComponent('შავი')));assert.equal(doc.rows.length,2);pass('material filter matches inventory page');
 await assert.rejects(()=>getStocktakeDocument(tx,bid,new URLSearchParams('kind=other&scope=all')),/ტიპი/);await assert.rejects(()=>getStocktakeDocument(tx,bid,new URLSearchParams('kind=products&scope=wrong')),/აირჩიე/);pass('invalid kind and scope rejected');
 await tx.business.update({where:{id:bid},data:{mode:'IMPORT'}});await assert.rejects(()=>getStocktakeDocument(tx,bid,new URLSearchParams('kind=materials&scope=all')),e=>e.status===403);pass('import business cannot export material inventory');
 const fixture={...doc,rows:Array.from({length:90},(_,i)=>({id:'row-'+i,name:'ნიმუში '+(i+1)+' გრძელი ქართული დასახელება',details:'ცისფერი · ქსოვილი · '+('მახასიათებელი '.repeat(i===2?180:3)),unit:i%2?'მ²':'მეტრი',quantity:'12.5',defective:'0.25'}))};
 const blob=await createStocktakePdf(fixture,{regular:fs.readFileSync(path.join(root,'public/fonts/FiraGO-Regular.otf')),bold:fs.readFileSync(path.join(root,'public/fonts/FiraGO-Bold.otf'))});const pdf=await PDFDocument.load(await blob.arrayBuffer());assert.ok(pdf.getPageCount()>1);for(const page of pdf.getPages()){assert.ok(Math.abs(page.getWidth()-595.2756)<0.1);assert.ok(Math.abs(page.getHeight()-841.8898)<0.1);}assert.equal(pdf.getForm().getFields().length,270);pass('multi-page A4 PDF with long Georgian text and 3 editable fields per row');fs.mkdirSync(path.join(root,'outputs/stocktake-qa'),{recursive:true});fs.writeFileSync(path.join(root,'outputs/stocktake-qa/stocktake-A4.pdf'),new Uint8Array(await blob.arrayBuffer()));
 throw rollback;
},{timeout:120000});}catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(passed+' checks passed; fixtures rolled back.');})().catch(e=>{console.error(e.name,e.message,e.stack);process.exitCode=1;});
