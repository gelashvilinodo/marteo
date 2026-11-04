/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with a temporary business, owner and sessions. */
// Needs the dev server started with SYSTEM_ERRORS_LOCAL=1 so server errors are recorded locally.
require('dotenv').config({quiet:true});
const {Client,types}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='sys-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',businessId=tag+'-biz',sessionIds=[],bannerIds=[];
 const lib=f=>import(pathToFileURL(path.join(__dirname,'../lib/system',f)).href);
 const {describeArgs,recordSystemError}=await lib('system-errors.mjs');
 const {runJob}=await lib('job-runs.mjs');
 const startedAt=new Date();
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(admins.length,1);
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),now())',[ownerId,tag+'@example.invalid','+000'+tag,'disabled-qa-password']);
  await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[businessId,'QA სისტემა']);
  await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[tag+'-m',ownerId,businessId]);
  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000).toISOString()]);return token}
  const adminToken=await session(admins[0].id),ownerToken=await session(ownerId);
  const call=(p,token,body,method)=>fetch(base+p,{method:method||(body?'POST':'GET'),redirect:'manual',headers:{Cookie:'marteo_session='+token,...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{}),...(method==='DELETE'?{Origin:base}:{})},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const page=async(p,token=adminToken)=>{const res=await call(p,token);assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};
  const errors=async()=>(await db.query('SELECT id,source,message,route,count,"resolvedAt" FROM "SystemError" WHERE message LIKE $1 OR route LIKE $2 ORDER BY "firstAt"',['%'+tag+'%','%/api/ai/chat%'])).rows;

  // Privacy: an Error contributes only its type; ids and long numbers group together.
  const secret=new Error('customer phone 599123456 leaked');
  assert.equal(describeArgs([`QA ${tag} failed`,secret]),`QA ${tag} failed Error`);
  const prismaLike=Object.assign(new Error('Unique constraint on email foo@bar.ge'),{name:'PrismaClientKnownRequestError',code:'P2002'});
  assert.equal(describeArgs(['Save failed',prismaLike]),'Save failed PrismaClientKnownRequestError P2002');
  await recordSystemError(process.env.DIRECT_URL,{source:'server',message:`QA ${tag} order clx0abcdefghijklmnopqrstu failed 12345`});
  await recordSystemError(process.env.DIRECT_URL,{source:'server',message:`QA ${tag} order clx0zyxwvutsrqponmlkjihgf failed 67890`});
  await recordSystemError(process.env.DIRECT_URL,{source:'server',message:`QA ${tag} other failure`});
  let rows=(await errors()).filter(row=>row.message.includes(tag));
  assert.equal(rows.length,2,'ids and numbers group');assert.equal(rows.find(row=>row.message.includes('order')).count,2);

  // Real capture: a NUL byte in the order id makes Postgres reject the query; the route's console.error lands in the log.
  // SYSTEM_QA_SKIP_CAPTURE=1 for a dev server started without SYSTEM_ERRORS_LOCAL=1.
  let r=await call('/api/orders/%00/details-pg',ownerToken);assert.equal(r.status,500);
  let captured=[];
  if(process.env.SYSTEM_QA_SKIP_CAPTURE!=='1'){
  const recentOrderErrors=async()=>(await db.query('SELECT id,source,message,route FROM "SystemError" WHERE message LIKE \'Order operation failed%\' AND "lastAt">=$1',[startedAt.toISOString()])).rows;
  for(let i=0;i<20&&!captured.length;i++){await sleep(500);captured=await recentOrderErrors();}
  assert.ok(captured.length>0,'server error captured');
  assert.ok(captured.every(row=>row.source==='server'&&!row.message.includes('\u0000')),'no request content stored');
  console.log('captured:',JSON.stringify(captured.map(row=>({source:row.source,message:row.message,route:row.route}))));
  }else console.log('capture check skipped');

  // Resolve one; it reopens when it happens again.
  const target=rows.find(row=>row.message.includes('other'));
  assert.equal((await call('/api/admin/system/errors',ownerToken,{id:target.id})).status,403);
  r=await call('/api/admin/system/errors',adminToken,{id:target.id});assert.equal(r.status,200);
  assert.equal((await call('/api/admin/system/errors',adminToken,{id:target.id})).status,404);
  await recordSystemError(process.env.DIRECT_URL,{source:'server',message:`QA ${tag} other failure`});
  rows=(await errors()).filter(row=>row.id===target.id);assert.equal(rows[0].resolvedAt,null);assert.equal(rows[0].count,2);

  // Jobs: success and failure are recorded; a failure also lands in the error log.
  await runJob(process.env.DIRECT_URL,tag+'-ok',async()=>7);
  await runJob(process.env.DIRECT_URL,tag+'-fail',async()=>{throw new TypeError('secret detail');});
  const jobs=(await db.query('SELECT name,"lastOk","lastResult","lastError",runs,failures FROM "SystemJob" WHERE name LIKE $1 ORDER BY name',[tag+'%'])).rows;
  assert.deepEqual(jobs.map(j=>[j.name.slice(tag.length),j.lastOk,j.lastResult,j.lastError,j.runs,j.failures]),[['-fail',false,null,'TypeError',1,1],['-ok',true,7,null,1,0]]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "SystemError" WHERE source=\'cron\' AND route=$1',[tag+'-fail'])).rows[0].n,1);

  // Banner validation.
  for(const bad of [{message:'',tone:'INFO'},{message:'x',tone:'RED'},{message:'x',tone:'INFO',startsAt:'2030-01-02T10:00',endsAt:'2030-01-01T10:00'},{message:'x',tone:'INFO',endsAt:'2024-01-01T10:00'},{message:'x'.repeat(201),tone:'INFO'}]){
   assert.equal((await call('/api/admin/system/banners',adminToken,bad)).status,422,JSON.stringify(bad));
  }
  assert.equal((await call('/api/admin/system/banners',ownerToken,{message:'x',tone:'INFO'})).status,403);
  const bannerIdsFor=async()=>(await db.query('SELECT id FROM "SystemBanner" WHERE message LIKE $1',['%'+tag+'%'])).rows.map(x=>x.id);

  // A scheduled banner does not show yet.
  r=await call('/api/admin/system/banners',adminToken,{message:`დაგეგმილი ${tag}`,tone:'INFO',startsAt:'2030-01-01T10:00'});assert.equal(r.status,200);
  bannerIds.push(...await bannerIdsFor());
  let html=await page('/dashboard',ownerToken);assert.ok(!html.includes(`დაგეგმილი ${tag}`));

  // An active banner is visible to everyone, so it lives only for these two requests.
  r=await call('/api/admin/system/banners',adminToken,{message:`ტექნიკური შემოწმება ${tag}`,tone:'WARNING'});assert.equal(r.status,200);
  const ids=await bannerIdsFor();const active=ids.find(id=>!bannerIds.includes(id));bannerIds.push(active);
  html=await page('/dashboard',ownerToken);
  r=await call(`/api/admin/system/banners/${active}`,adminToken,undefined,'DELETE');assert.equal(r.status,200);
  assert.ok(html.includes(`ტექნიკური შემოწმება ${tag}`),'active banner shown');
  html=await page('/dashboard',ownerToken);assert.ok(!html.includes(`ტექნიკური შემოწმება ${tag}`),'canceled banner hidden');
  assert.equal((await call(`/api/admin/system/banners/${active}`,adminToken,undefined,'DELETE')).status,404);

  // Admin pages.
  html=await page('/admin/system');for(const t of ['პაკეტების ვადის შემოწმება','შეცდომები',`QA ${tag} other failure`,'ბანერი დაშბორდზე',`დაგეგმილი ${tag}`])assert.ok(html.includes(t),t);
  html=await page('/admin/audit?group=system');for(const t of ['ბანერი გამოქვეყნდა','ბანერი მოიხსნა'])assert.ok(html.includes(t),t);
  assert.equal((await call('/admin/system',ownerToken)).status,404);
  assert.equal((await call('/admin/audit',ownerToken)).status,404);

  console.log('PASS: error privacy/grouping, real server error capture, resolve/reopen, job runs, banner validation/schedule/show/cancel, admin pages, audit.');
 }finally{
  await db.query('DELETE FROM "SystemError" WHERE message LIKE $1 OR route LIKE $1',['%'+tag+'%']);
  // The capture check created an order error entry during this run; local dev only.
  await db.query('DELETE FROM "SystemError" WHERE message LIKE \'Order operation failed%\' AND "firstAt">=$1',[startedAt.toISOString()]).catch(()=>{});
  await db.query('DELETE FROM "SystemJob" WHERE name LIKE $1',[tag+'%']);
  if(bannerIds.length)await db.query('DELETE FROM "SystemBanner" WHERE id=ANY($1::text[])',[bannerIds]);
  await db.query('DELETE FROM "SystemBanner" WHERE message LIKE $1',['%'+tag+'%']);
  await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=ANY($1::text[]) OR ("targetType"=\'PLATFORM\' AND action LIKE \'banner-%\' AND "createdAt">=$2)',[bannerIds,startedAt.toISOString()]);
  await db.query('DELETE FROM "AdminAuditLog" WHERE action=\'errors-resolve\' AND "createdAt">=$1',[startedAt.toISOString()]);
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  await db.query('DELETE FROM "Business" WHERE id=$1',[businessId]);
  await db.query('DELETE FROM "User" WHERE id=$1',[ownerId]);
  const left=(await db.query('SELECT (SELECT count(*) FROM "SystemBanner" WHERE message LIKE $1)+(SELECT count(*) FROM "SystemError" WHERE message LIKE $1)+(SELECT count(*) FROM "SystemJob" WHERE name LIKE $1)+(SELECT count(*) FROM "User" WHERE id=$2) AS n',['%'+tag+'%',ownerId])).rows[0].n;
  console.log('cleanup leftovers:',Number(left));
  await db.end();
 }
})().catch(error=>{console.error('Admin system QA failed:',error.message);process.exitCode=1});
