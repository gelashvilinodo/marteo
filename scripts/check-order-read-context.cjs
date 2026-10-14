const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let user, membership, failure, created, disconnected, seenClient;
const client={businessMembership:{findFirst:async args=>{assert.equal(args.where.userId,'user-a');assert.equal(args.orderBy.createdAt,'asc');if(failure==='membership')throw Error();return membership;}},$disconnect:async()=>{disconnected++;}};
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/orders/order-read-context.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,require:n=>({
 '@/lib/auth/session':{getCurrentUserWithClient:async get=>{if(user==='none')return null;seenClient=get();if(failure==='authentication')throw Error();return user;}},
 '@/lib/prisma':{createPrismaClient:()=>{created++;return client;}},
 './order-http':{orderJson:(body,status=200)=>Response.json(body,{status}),orderError:()=>Response.json({success:false},{status:500})}
}[n])});
(async()=>{for(const scenario of ['none','active','no-membership','authentication','membership','read','not-found']){
 user=scenario==='none'?'none':{id:'user-a'};membership=scenario==='no-membership'?null:{businessId:'business-a'};failure=scenario;created=0;disconnected=0;let called=0;
 const response=await exportsObject.withOrderReadContext(async(db,businessId)=>{called++;assert.equal(db,client);assert.equal(db,seenClient);assert.equal(businessId,'business-a');if(failure==='read')throw Error();return Response.json({success:true},{status:scenario==='not-found'?404:200});});
 const expected=scenario==='none'?401:scenario==='no-membership'?403:['authentication','membership','read'].includes(scenario)?500:scenario==='not-found'?404:200;
 assert.equal(response.status,expected);assert.equal(created,scenario==='none'?0:1);assert.equal(disconnected,created);assert.equal(called,['active','read','not-found'].includes(scenario)?1:0);
 }console.log('Order read context checks passed (7 auth/lifecycle/error scenarios).');})().catch(e=>{console.error(e);process.exitCode=1;});
