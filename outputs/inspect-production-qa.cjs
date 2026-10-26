/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real DB fixtures are rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{randomUUID}=require('node:crypto');
const {readPurchase}=require('../lib/material-purchases/input.ts');const {saveMaterialPurchase,actOnPurchase}=require('../lib/material-purchases/store.ts');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});
const {readProduction,outputCosts}=require('../lib/production/input.ts');
const {saveProduction}=require('../lib/production/store.ts');
const {allocateStockLots}=require('../lib/orders/allocate-stock-lots.ts');
const {Prisma}=require('../generated/prisma/client.ts');

(async()=>{try {const tag='QA-PROD-20261026-1620'; const purchases=await db.materialPurchase.findMany({where:{name:tag},include:{items:true}}); const productions=await db.production.findMany({where:{name:tag},include:{inputs:true,outputs:{where:{active:true},include:{stockLot:true}}}}); const materials=await db.material.findMany({where:{name:tag+' ქსოვილი'},select:{id:true,businessId:true,currentStock:true,name:true}}); const products=await db.inventoryItem.findMany({where:{product:{name:tag+' ჩანთა'}},select:{id:true,businessId:true,currentStock:true,productId:true}}); const orders=await db.order.findMany({where:{recipientFirstName:tag},include:{items:{include:{allocations:true}},financialEntries:{include:{items:true}},payments:true}}); console.log(JSON.stringify({purchases,productions,materials,products,orders},null,2));}finally{await db.$disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
