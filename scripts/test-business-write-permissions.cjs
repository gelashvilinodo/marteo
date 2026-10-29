/* eslint-disable @typescript-eslint/no-require-imports -- Real mutation entrypoints with isolated identity/database doubles. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let role='MEMBER',signedIn=true,writes=0,queries=0;
const load=Module._load;
Module._load=function(id,parent,...args){
 if(id==='server-only')return {};
 if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};
 if(id==='@/lib/auth/session')return {getCurrentUser:async()=>signedIn?{id:'self'}:null};
 if(id==='@/lib/prisma')return {createPrismaClient:()=>({businessMembership:{findFirst:async()=>{queries++;return role===null?null:{businessId:'own-business',role};}},$transaction:async()=>{writes++;throw new Error('WRITE_REACHED');},$disconnect:async()=>{}})};
 return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args);
};
const {saveOrder}=require('../lib/orders/save-order.ts'),{mutateOrder}=require('../lib/orders/order-mutations.ts'),{mutateCustomers}=require('../lib/customers/customer-mutations.ts'),{createExpense}=require('../lib/analytics/create-expense.ts');
const order={clientRequestId:randomUUID(),recipientPhone:'+995599000001',recipientFirstName:'QA',recipientLastName:'',shippingAddress:'QA',status:'PROCESSING',courierFee:'0',paidAmount:'0',paymentMethod:'CASH',bankName:'',items:[{source:'MANUAL',name:'QA',quantity:1,unitPrice:'10',unitCost:'2',condition:'GOOD'}]};
const actions=[['create order',()=>saveOrder(order)],['mutate order',()=>mutateOrder('foreign-order','delete',{requestId:randomUUID(),expectedVersion:1})],['mutate customer',()=>mutateCustomers('delete',{ids:['foreign-customer'],confirmDeletion:true})],['create expense',()=>createExpense({requestId:randomUUID(),category:'OTHER',amount:'10',expenseDate:'2026-10-28',title:'QA',note:''})]];
(async()=>{let passed=0;for(const [name,run] of actions){
 for(const denied of ['MEMBER',null,'UNKNOWN']){role=denied;const before=writes;await assert.rejects(run,error=>error.status===403);assert.equal(writes,before);console.log('PASS '+name+' rejects '+denied+' before transaction');passed++;}
 for(const allowed of ['OWNER','ADMIN']){role=allowed;await assert.rejects(run,/WRITE_REACHED/);console.log('PASS '+name+' permits '+allowed+' to own-business transaction');passed++;}
 signedIn=false;const before=queries;await assert.rejects(run,error=>error.status===401);assert.equal(queries,before);signedIn=true;console.log('PASS '+name+' denies anonymous before membership lookup');passed++;
}console.log(passed+' write permission checks passed; no DB or provider access.');})().catch(error=>{console.error(error);process.exitCode=1;});
