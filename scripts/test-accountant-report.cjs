/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});

const {getAccountantReport}=require('../lib/analytics/report/get-report.ts');
const {getPurchaseFormOptions}=require('../lib/purchases/get-purchase-form-options.ts');
const {createAccountantPdf}=require('../lib/analytics/report/create-pdf.ts');
const {PDFDocument}=require('pdf-lib');
const rollback=new Error('ROLLBACK');let passed=0;const pass=n=>{passed++;console.log('PASS',n)};
(async()=>{try{await db.$transaction(async tx=>{
 const b=await tx.business.create({data:{name:'სატესტო ბუღალტრის ანგარიში',mode:'HYBRID'}}),other=await tx.business.create({data:{name:'Foreign report'}});const businessId=b.id,when=new Date('2026-10-20T10:00:00Z');
 const entry=(eventKey,kind,revenue,cost)=>tx.orderFinancialEntry.create({data:{businessId,eventKey,kind,fulfillmentCycle:1,orderNumber:1,productRevenueDelta:revenue,deliveryRevenueDelta:800,costOfGoodsDelta:cost,costComplete:true,occurredAt:when}});
 await entry('sale','SALE',1000,400);await entry('return','RETURN',-100,-40);
 await tx.orderFinancialEntry.create({data:{businessId:other.id,eventKey:'foreign',kind:'SALE',fulfillmentCycle:1,productRevenueDelta:9999,costOfGoodsDelta:0,costComplete:true,occurredAt:when}});
 await tx.expense.create({data:{businessId,category:'RENT',amount:50,expenseDate:when,title:'ქირა'}});
 await tx.purchase.create({data:{businessId,number:1,name:'ჩინეთიდან',country:'ჩინეთი',purchaseDate:when,shippingCost:20,customsCost:30,otherCost:5}});
 await tx.purchase.create({data:{businessId,number:2,name:'Outside period',country:'თურქეთი',purchaseDate:new Date('2026-09-01T00:00:00Z')}});
 await tx.purchase.create({data:{businessId:other.id,number:1,country:'FOREIGN',purchaseDate:when}});
 await tx.materialPurchase.create({data:{businessId,number:1,requestId:randomUUID(),country:'საქართველო',purchaseDate:when,shippingCost:0,customsCost:0,otherCost:0,createdById:'QA',updatedById:'QA',deletedAt:when}});
 const params=new URLSearchParams('from=2026-10-20&to=2026-10-20');let report=await getAccountantReport(tx,businessId,params);
 assert.deepEqual(report.highlights.map(h=>h.value),['900.00 ₾','540.00 ₾','490.00 ₾']);pass('gross and net reconcile with returns, exclude courier 800 and do not deduct purchases twice');
 assert.equal(report.sections.find(s=>s.title==='პროდუქტების შესყიდვები').rows.length,1);assert.ok(report.sections.find(s=>s.title==='პროდუქტების შესყიდვები').rows[0][1].includes('ჩინეთი'));assert.equal(report.sections.find(s=>s.title==='მასალების შესყიდვები').rows.length,0);assert.equal(report.sections.find(s=>s.title==='გაყიდვები, დაბრუნებები და შესწორებები').rows.length,2);pass('business and inclusive date scopes, country, deleted material purchase exclusion');
 const opts=await getPurchaseFormOptions(tx,businessId);assert.deepEqual(opts.countryOptions,['თურქეთი','ჩინეთი']);pass('remembered countries scoped to business, including past periods');
 await assert.rejects(()=>getAccountantReport(tx,businessId,new URLSearchParams('from=bad&to=2026-10-20')),/თარიღი/);pass('invalid dates rejected instead of exporting fallback range');
 await tx.orderFinancialEntry.updateMany({where:{businessId,eventKey:'sale'},data:{costComplete:false}});report=await getAccountantReport(tx,businessId,params);assert.equal(report.highlights[1].value,'დასაზუსტებელია');assert.equal(report.highlights[2].value,'დასაზუსტებელია');assert.ok(report.warnings.some(w=>w.includes('მოგება დაუზუსტებელია')));pass('unknown cost does not become zero or misleading full profit');
 const fixture={...report,sections:report.sections.map(s=>s.title==='გაყიდვები, დაბრუნებები და შესწორებები'?{...s,rows:Array.from({length:90},(_,i)=>[String(i+1),'გაყიდვა','1000.00 ₾','400.00 ₾','გრძელი ქართული ჩანაწერი '.repeat(5)])}:s)};
 const blob=await createAccountantPdf(fixture,{regular:fs.readFileSync(path.join(root,'public/fonts/FiraGO-Regular.otf')),bold:fs.readFileSync(path.join(root,'public/fonts/FiraGO-Bold.otf'))});const pdf=await PDFDocument.load(await blob.arrayBuffer());assert.ok(pdf.getPageCount()>1);for(const p of pdf.getPages()){assert.ok(Math.abs(p.getWidth()-595.2756)<.1);assert.ok(Math.abs(p.getHeight()-841.8898)<.1);}fs.mkdirSync(path.join(root,'outputs/accountant-qa'),{recursive:true});fs.writeFileSync(path.join(root,'outputs/accountant-qa/accountant-A4.pdf'),new Uint8Array(await blob.arrayBuffer()));pass('multipage A4 Georgian PDF generated');
 throw rollback;
},{timeout:120000,maxWait:30000});}catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(passed+' checks passed; fixtures rolled back.');})().catch(e=>{console.error(e);process.exitCode=1;});
