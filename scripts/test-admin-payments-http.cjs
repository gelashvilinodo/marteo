/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with a temporary business, owner and sessions. */
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tbilisi'}).format(d);
const DAY=86400000;
// Prisma stores UTC "timestamp without time zone"; read it as UTC, not the machine's local time.
require('pg').types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='pay-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',businessId=tag+'-biz',name='QA გადახდები '+tag,sessionIds=[];
 const {expireSubscriptions}=await import(pathToFileURL(path.join(__dirname,'../lib/billing/expire-subscriptions.mjs')).href);
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(admins.length,1);
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),now())',[ownerId,tag+'@example.invalid','+000'+tag,'disabled-qa-password']);
  await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[businessId,name]);
  await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[tag+'-m',ownerId,businessId]);
  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+600000)]);return token}
  const adminToken=await session(admins[0].id),ownerToken=await session(ownerId);
  const call=(p,token,body)=>fetch(base+p,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:'marteo_session='+token,...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});
  const pay=body=>call(`/api/admin/businesses/${businessId}/payments`,adminToken,{plan:'START',months:1,amount:'49.90',method:'BANK_TRANSFER',paidAt:day(new Date()),...body});
  const sub=async()=>(await db.query('SELECT plan::text,status::text,"expiresAt" FROM "Subscription" WHERE "businessId"=$1',[businessId])).rows[0];

  // Validation and access.
  for(const bad of [{amount:'abc'},{amount:'0'},{plan:'FREE'},{method:'BTC'},{months:0},{months:25},{paidAt:day(new Date(Date.now()+3*DAY))}]){
   const r=await pay(bad);assert.equal(r.status,422,JSON.stringify(bad));
  }
  assert.equal((await call(`/api/admin/businesses/${businessId}/payments`,ownerToken,{plan:'START',months:1,amount:'1',method:'CASH',paidAt:day(new Date())})).status,403);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "SubscriptionPayment" WHERE "businessId"=$1',[businessId])).rows[0].n,0);

  // First payment starts today and lasts one month.
  let r=await pay({});let data=await r.json();assert.equal(r.status,200,data.message);
  assert.equal(data.payments.length,1);assert.equal(data.payments[0].amount,'49.90');
  let s=await sub();assert.equal(s.plan,'START');assert.equal(s.status,'ACTIVE');
  const oneMonth=new Date(Date.now());oneMonth.setMonth(oneMonth.getMonth()+1);
  assert.ok(Math.abs(s.expiresAt-oneMonth)<2*DAY,'first period ~1 month');
  const firstEnd=s.expiresAt;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND kind=\'PAYMENT_CONFIRMED\'',[ownerId])).rows[0].n,1);

  // Same plan renewal continues from the current end.
  r=await pay({months:3,amount:'129,50',method:'CASH',note:'QA'});data=await r.json();assert.equal(r.status,200,data.message);
  s=await sub();const second=data.payments[0];
  assert.equal(new Date(second.periodStart).getTime(),firstEnd.getTime(),'renewal continues');
  assert.equal(second.amount,'129.50');
  assert.ok(s.expiresAt-firstEnd>88*DAY&&s.expiresAt-firstEnd<93*DAY,'+3 months');

  // Upgrade starts today.
  r=await pay({plan:'PRO',amount:'99'});data=await r.json();assert.equal(r.status,200,data.message);
  assert.ok(Math.abs(new Date(data.payments[0].periodStart)-Date.now())<60000,'upgrade starts now');
  assert.equal((await sub()).plan,'PRO');

  // Void: reason required, then struck out and out of totals; plan left alone.
  const before=await sub();
  assert.equal((await call(`/api/admin/businesses/${businessId}/payments/${second.id}/void`,adminToken,{reason:''})).status,422);
  r=await call(`/api/admin/businesses/${businessId}/payments/${second.id}/void`,adminToken,{reason:'QA შეცდომა'});data=await r.json();assert.equal(r.status,200,data.message);
  assert.ok(data.payments.find(p=>p.id===second.id).voidedAt);
  assert.equal((await call(`/api/admin/businesses/${businessId}/payments/${second.id}/void`,adminToken,{reason:'again'})).status,404);
  assert.deepEqual(await sub(),before);
  const audit=(await db.query('SELECT action FROM "AdminAuditLog" WHERE "targetId"=$1 ORDER BY "createdAt"',[businessId])).rows.map(x=>x.action);
  assert.deepEqual(audit,['payment','payment','payment','payment-void']);

  // Pages and export.
  const page=async p=>{const res=await call(p,adminToken);assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};
  let html=await page('/admin');for(const t of ['შემოსავალი','თვიური შემოსავალი (MRR)','შეწყვიტეს გადახდა'])assert.ok(html.includes(t),t);
  html=await page('/admin/payments?q='+encodeURIComponent(tag));assert.ok(html.includes(name));assert.ok(html.includes('2 გადახდა'),'voided hidden by default');
  html=await page('/admin/payments?voided=only&q='+encodeURIComponent(tag));assert.ok(html.includes('1 გადახდა'));
  html=await page(`/admin/businesses/${businessId}`);for(const t of ['გადახდები','გადახდის დამატება','QA შეცდომა','გადახდა აღირიცხა'])assert.ok(html.includes(t),t);
  html=await page('/admin/businesses?billing=paying&q='+encodeURIComponent(tag));assert.ok(html.includes(name),'paying filter');
  html=await page('/admin/businesses?billing=lapsed&q='+encodeURIComponent(tag));assert.ok(!html.includes(name),'not lapsed yet');
  r=await fetch(`${base}/api/admin/export/payments?q=${encodeURIComponent(tag)}`,{method:'POST',headers:{Cookie:'marteo_session='+adminToken,Origin:base}});data=await r.json();
  assert.equal(r.status,200,data.message);assert.equal(data.rows.length,2);assert.equal(typeof data.rows[0]['თანხა (₾)'],'number');

  // Reminders: 7, 3 and 1 day stages, each once, owners only.
  const unread=()=>call('/api/notifications/unread',ownerToken);
  const keys=async()=>(await db.query('SELECT "dedupeKey" FROM "Notification" WHERE "userId"=$1 AND kind=\'RENEWAL_REMINDER\' ORDER BY "createdAt"',[ownerId])).rows.map(x=>x.dedupeKey);
  const setEnd=async(ms,status='ACTIVE')=>db.query('UPDATE "Subscription" SET "expiresAt"=$2,status=$3::"SubscriptionStatus" WHERE "businessId"=$1',[businessId,new Date(Date.now()+ms).toISOString(),status]);
  await setEnd(5*DAY);assert.equal((await unread()).status,200);await unread();
  let k=await keys();assert.equal(k.length,1);assert.ok(k[0].includes(':d7:'),k[0]);
  await db.query('UPDATE "Subscription" SET "expiresAt"="expiresAt"-interval \'3 days\' WHERE "businessId"=$1',[businessId]);await unread();
  k=await keys();assert.equal(k.length,2);assert.ok(!/:d\d:/.test(k[1]),'3-day key keeps old format');
  await db.query('UPDATE "Subscription" SET "expiresAt"="expiresAt"-interval \'1 day 12 hours\' WHERE "businessId"=$1',[businessId]);await unread();await unread();
  k=await keys();assert.equal(k.length,3);assert.ok(k[2].includes(':d1:'));

  // Expiry: cron moves ACTIVE -> PAST_DUE, then EXPIRED after 7 days; the owner gets one "ended" notice.
  await setEnd(-3600000);
  await expireSubscriptions(process.env.DIRECT_URL);
  assert.equal((await sub()).status,'PAST_DUE');
  await unread();await unread();k=await keys();assert.equal(k.filter(x=>x.startsWith('ended:')).length,1);
  html=await page('/admin/businesses?billing=lapsed&q='+encodeURIComponent(tag));assert.ok(html.includes(name),'lapsed filter');
  await db.query('UPDATE "Subscription" SET "expiresAt"=now() AT TIME ZONE \'UTC\'-interval \'8 days\' WHERE "businessId"=$1',[businessId]);
  await expireSubscriptions(process.env.DIRECT_URL);
  assert.equal((await sub()).status,'EXPIRED');
  const auto=(await db.query('SELECT before->>\'status\' AS a,after->>\'status\' AS b FROM "AdminAuditLog" WHERE "targetId"=$1 AND action=\'subscription-auto\' ORDER BY "createdAt"',[businessId])).rows;
  assert.deepEqual(auto,[{a:'ACTIVE',b:'PAST_DUE'},{a:'PAST_DUE',b:'EXPIRED'}]);
  html=await page(`/admin/businesses/${businessId}`);assert.ok(html.includes('ავტომატურად'));

  // Trial ends straight to EXPIRED.
  await setEnd(-60000,'TRIALING');await expireSubscriptions(process.env.DIRECT_URL);assert.equal((await sub()).status,'EXPIRED');

  console.log('PASS: payment validation/access, period continue/upgrade, void, audit, pages, filters, export, 7/3/1 reminders, ended notice, cron PAST_DUE/EXPIRED, trial expiry.');
 }finally{
  // Payments survive business deletion by design, so the QA rows go first.
  await db.query('DELETE FROM "SubscriptionPayment" WHERE "businessId"=$1',[businessId]);
  await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=$1',[businessId]);
  await db.query('DELETE FROM "Notification" WHERE "userId"=$1',[ownerId]);
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  await db.query('DELETE FROM "Business" WHERE id=$1',[businessId]);
  await db.query('DELETE FROM "User" WHERE id=$1',[ownerId]);
  const left=(await db.query('SELECT (SELECT count(*) FROM "Business" WHERE id=$1)+(SELECT count(*) FROM "User" WHERE id=$2)+(SELECT count(*) FROM "SubscriptionPayment" WHERE "businessName" LIKE $3) AS n',[businessId,ownerId,'%'+tag])).rows[0].n;
  console.log('cleanup leftovers:',Number(left));
  await db.end();
 }
})().catch(error=>{console.error('Admin payments QA failed:',error.message);process.exitCode=1});
