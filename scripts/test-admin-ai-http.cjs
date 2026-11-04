/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with a temporary business, owner and sessions. */
require('dotenv').config({quiet:true});
require('dotenv').config({path:'.env.local',quiet:true});
const {Client,types}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
// Prisma stores UTC "timestamp without time zone"; read it as UTC, not the machine's local time.
types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
// One real question to Claude Haiku 5.5 (a fraction of a cent) proves tokens and cost are recorded; skip with AI_QA_SKIP_MODEL=1.
const callModel=process.env.AI_QA_SKIP_MODEL!=='1';

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='ai-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',businessId=tag+'-biz',name='QA AI '+tag,sessionIds=[];
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(admins.length,1);
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),now())',[ownerId,tag+'@example.invalid','+000'+tag,'disabled-qa-password']);
  await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[businessId,name]);
  await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[tag+'-m',ownerId,businessId]);
  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000).toISOString()]);return token}
  const adminToken=await session(admins[0].id),ownerToken=await session(ownerId);
  const call=(p,token,body,method)=>fetch(base+p,{method:method||(body?'POST':'GET'),redirect:'manual',headers:{Cookie:'marteo_session='+token,...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});
  const rows=async()=>(await db.query('SELECT kind::text,counted,failed,calls,"inputTokens","outputTokens","costUsd"::float AS cost FROM "AiUsage" WHERE "businessId"=$1 ORDER BY "createdAt"',[businessId])).rows;
  const quota=async()=>{const r=await call('/api/ai/quota',ownerToken);const d=await r.json();assert.equal(r.status,200,d.message);return d.quota};
  const ask=()=>call('/api/ai/chat',ownerToken,{messages:[{role:'user',text:'რამდენი შეკვეთა მაქვს ამ თვეში?'}]});
  const file=()=>call('/api/ai/purchase-draft',ownerToken,{target:'products',fileName:'qa.csv',rows:[{row:1,cells:['name','qty','price']},{row:2,cells:['Bag','2','10']}],photoCount:0});
  const setAi=(body,token=adminToken)=>call(`/api/admin/businesses/${businessId}/ai`,token,body,'PUT');

  // FREE (no subscription) starts at 0 / 30.
  let q=await quota();assert.equal(q.plan,'FREE');assert.equal(q.used,0);assert.equal(q.limit,30);assert.equal(q.disabled,false);

  if(callModel){
   const r=await ask();const d=await r.json();assert.equal(r.status,200,d.message);assert.ok(d.reply);assert.equal(d.quota.used,1);
   const [row]=await rows();
   assert.equal(row.kind,'CHAT');assert.equal(row.counted,true);assert.equal(row.failed,false);
   assert.ok(row.calls>=1&&row.inputTokens>0&&row.outputTokens>0&&row.cost>0,JSON.stringify(row));
   console.log('model call recorded:',JSON.stringify(row));
  }

  // Fill the month: the next question and file are refused before the model is called.
  const used=(await quota()).used;
  await db.query(`INSERT INTO "AiUsage" (id,"businessId","businessName",kind,model,counted) SELECT gen_random_uuid()::text,$1,$2,'CHAT','claude-haiku-5-5',true FROM generate_series(1,$3)`,[businessId,name,30-used]);
  // A title and a failed request never count.
  await db.query(`INSERT INTO "AiUsage" (id,"businessId","businessName",kind,model,counted,failed) VALUES (gen_random_uuid()::text,$1,$2,'TITLE','claude-haiku-5-5',false,false),(gen_random_uuid()::text,$1,$2,'CHAT','claude-haiku-5-5',false,true)`,[businessId,name]);
  q=await quota();assert.equal(q.used,30);
  const before=(await rows()).length;
  let r=await ask();let d=await r.json();assert.equal(r.status,429);assert.match(d.message,/ლიმიტი ამოიწურა \(30\/30\)/);
  r=await file();d=await r.json();assert.equal(r.status,429,d.message);
  assert.equal((await rows()).length,before,'refused requests leave no row');

  // Admin: validation and access.
  r=await setAi({disabled:false,monthlyLimit:-1});d=await r.json();assert.equal(r.status,422,JSON.stringify(d));
  assert.equal((await setAi({disabled:'yes',monthlyLimit:null})).status,422);
  assert.equal((await setAi({disabled:false,monthlyLimit:null})).status,409,'no change');
  assert.equal((await setAi({disabled:false,monthlyLimit:40},ownerToken)).status,403);

  // Custom limit lifts the cap.
  r=await setAi({disabled:false,monthlyLimit:40});d=await r.json();assert.equal(r.status,200,d.message);assert.equal(d.ai.limit,40);assert.equal(d.ai.custom,true);
  q=await quota();assert.equal(q.limit,40);assert.equal(q.custom,true);

  // Switched off: refused with its own message, ring shows disabled.
  r=await setAi({disabled:true,monthlyLimit:40});assert.equal(r.status,200);
  q=await quota();assert.equal(q.disabled,true);
  r=await ask();d=await r.json();assert.equal(r.status,403);assert.match(d.message,/გამორთულია/);
  r=await file();assert.equal(r.status,403);
  assert.equal((await rows()).length,before);

  // Back to the plan's limit.
  r=await setAi({disabled:false,monthlyLimit:null});assert.equal(r.status,200);
  q=await quota();assert.equal(q.limit,30);assert.equal(q.custom,false);assert.equal(q.disabled,false);

  // Paid plan raises the limit.
  await db.query('INSERT INTO "Subscription" (id,"businessId",plan,status,"expiresAt","updatedAt") VALUES ($1,$2,\'PRO\',\'ACTIVE\',$3,now())',[tag+'-s',businessId,new Date(Date.now()+30*86400000).toISOString()]);
  q=await quota();assert.equal(q.plan,'PRO');assert.equal(q.limit,1500);

  // Admin pages.
  const page=async p=>{const res=await call(p,adminToken);assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};
  let html=await page('/admin/ai');for(const t of ['ხარჯი ამ თვეში','ყველაზე მეტად იყენებენ',name])assert.ok(html.includes(t),t);
  html=await page(`/admin/businesses/${businessId}`);for(const t of ['მართეო AI','ცალკე თვიური ლიმიტი','AI-ის პარამეტრები შეიცვალა'])assert.ok(html.includes(t),t);
  assert.equal((await call('/admin/ai',ownerToken)).status,404);
  const audit=(await db.query('SELECT count(*)::int AS n FROM "AdminAuditLog" WHERE "targetId"=$1 AND action=\'ai-settings\'',[businessId])).rows[0].n;
  assert.equal(audit,3);

  console.log('PASS: quota by plan, limit refusal (chat + file), titles/failed not counted, admin limit override, disable switch, validation/access, admin pages, audit.');
 }finally{
  // Usage rows survive business deletion by design, so the QA rows go first.
  await db.query('DELETE FROM "AiUsage" WHERE "businessId"=$1',[businessId]);
  await db.query('DELETE FROM "AiConversation" WHERE "businessId"=$1',[businessId]);
  // Burst buckets are keyed by a hash and expire within 10 minutes on their own.
  await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=$1',[businessId]);
  await db.query('DELETE FROM "Notification" WHERE "userId"=$1',[ownerId]);
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  await db.query('DELETE FROM "Business" WHERE id=$1',[businessId]);
  await db.query('DELETE FROM "User" WHERE id=$1',[ownerId]);
  const left=(await db.query('SELECT (SELECT count(*) FROM "Business" WHERE id=$1)+(SELECT count(*) FROM "User" WHERE id=$2)+(SELECT count(*) FROM "AiUsage" WHERE "businessName"=$3) AS n',[businessId,ownerId,name])).rows[0].n;
  console.log('cleanup leftovers:',Number(left));
  await db.end();
 }
})().catch(error=>{console.error('Admin AI QA failed:',error.message);process.exitCode=1});
