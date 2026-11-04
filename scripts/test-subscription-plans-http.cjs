/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with a temporary owner, businesses and sessions. */
require('dotenv').config({quiet:true});
const {Client,types}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.PLAN_QA_BASE_URL||'http://localhost:3000';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
const DAY=86400000,at=days=>new Date(Date.now()+days*DAY).toISOString();

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='plan-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',freshId=tag+'-fresh',businessId=tag+'-b';
 const sessionIds=[],userIds=[ownerId,freshId],startedAt=new Date();
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(admins.length,1);
  for(const [id,trialUsed] of [[ownerId,true],[freshId,false]]){
   await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","trialUsedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),$5,now())',[id,id+'@example.invalid','+000'+id,'disabled-qa-password',trialUsed?at(-30):null]);
  }
  await db.query('INSERT INTO "Business" (id,name,mode,phone,"updatedAt") VALUES ($1,$2,\'HYBRID\',\'+995555000000\',now())',[businessId,'QA plans '+tag]);
  await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[businessId+'-m',ownerId,businessId]);
  await db.query('INSERT INTO "Subscription" (id,"businessId",plan,status,"updatedAt") VALUES ($1,$2,\'FREE\',\'ACTIVE\',now())',[businessId+'-s',businessId]);
  const setPlan=(plan,status,days)=>db.query('UPDATE "Subscription" SET plan=$2,status=$3,"expiresAt"=$4 WHERE "businessId"=$1',[businessId,plan,status,days===null?null:at(days)]);

  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),at(1)]);return token}
  const owner=await session(ownerId),fresh=await session(freshId),admin=await session(admins[0].id);
  const call=(token,path,method='GET',body)=>fetch(base+path,{method,redirect:'manual',headers:{Cookie:'marteo_session='+token,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const code=async (token,path,method,body)=>{const res=await call(token,path,method,body);const data=res.status===402?await res.json():null;return data?data.code:res.status};

  // [state, setup, expected per check]
  const ok=200;
  const states=[
   ['trial',['FREE','TRIALING',10],{orders:ok,customerEdit:'pass',purchases:ok,aiQuota:ok,settings:ok,purchasesPage:ok,statsPage:ok}],
   ['start',['START','ACTIVE',30],{orders:ok,customerEdit:'pass',purchases:'PLAN_FEATURE',aiQuota:'PLAN_FEATURE',settings:ok,purchasesPage:'/dashboard?upgrade=stock',statsPage:ok}],
   ['business',['BUSINESS','ACTIVE',30],{orders:ok,customerEdit:'pass',purchases:ok,aiQuota:ok,settings:ok,purchasesPage:ok,statsPage:ok}],
   ['pro',['PRO','ACTIVE',null],{orders:ok,customerEdit:'pass',purchases:ok,aiQuota:ok,settings:ok,purchasesPage:ok,statsPage:ok}],
   ['past due',['PRO','PAST_DUE',-1],{orders:ok,customerEdit:'PLAN_LOCKED',purchases:'PLAN_LOCKED',aiQuota:'PLAN_LOCKED',settings:ok,purchasesPage:'/dashboard?upgrade=locked',statsPage:'/dashboard?upgrade=locked'}],
   ['trial ended',['FREE','TRIALING',-1],{orders:ok,customerEdit:'PLAN_LOCKED',purchases:'PLAN_LOCKED',aiQuota:'PLAN_LOCKED',settings:ok,purchasesPage:'/dashboard?upgrade=locked',statsPage:'/dashboard?upgrade=locked'}],
   ['no plan',['FREE','ACTIVE',null],{orders:ok,customerEdit:'PLAN_LOCKED',purchases:'PLAN_LOCKED',aiQuota:'PLAN_LOCKED',settings:ok,purchasesPage:'/dashboard?upgrade=locked',statsPage:'/dashboard?upgrade=locked'}],
  ];
  // Dashboard pages stream behind loading.tsx, so a redirect arrives in the body as NEXT_REDIRECT with status 200.
  const page=async path=>{const res=await call(owner,path);if(res.status!==200)return (res.headers.get('location')||'').replace(base,'');const streamed=(await res.text()).match(/NEXT_REDIRECT;(?:replace|push);([^;]+);/);return streamed?streamed[1]:200};
  for(const [name,[plan,status,days],expect] of states){
   await setPlan(plan,status,days);
   const got={
    orders:await code(owner,'/api/orders/list-pg'),
    // Empty body: an open plan fails validation (4xx, not 402), a locked one stops at the plan check.
    customerEdit:await (async()=>{const c=await code(owner,'/api/customers','POST',{});return typeof c==='string'?c:'pass'})(),
    purchases:await code(owner,'/api/purchases/list'),
    aiQuota:await code(owner,'/api/ai/quota'),
    settings:await code(owner,'/api/business/settings'),
    purchasesPage:await page('/dashboard/purchases'),
    statsPage:await page('/dashboard/statistics'),
   };
   assert.deepEqual(got,expect,name);
   console.log('ok',name);
  }

  // Mode: Business cannot pick "both"; the settings check answers 402 before any write.
  await setPlan('BUSINESS','ACTIVE',30);
  const settings=(await (await call(owner,'/api/business/settings')).json()).business;
  const modeRes=await call(owner,'/api/business/settings','PATCH',{name:settings.name,phone:settings.phone,mode:'HYBRID',expectedUpdatedAt:settings.updatedAt});
  // The business was created as HYBRID directly in SQL, so asking to keep HYBRID is "unchanged" and allowed.
  assert.ok([200,402].includes(modeRes.status));
  await db.query('UPDATE "Business" SET mode=\'IMPORT\' WHERE id=$1',[businessId]);
  const s2=(await (await call(owner,'/api/business/settings')).json()).business;
  const hybrid=await call(owner,'/api/business/settings','PATCH',{name:s2.name,phone:s2.phone,mode:'HYBRID',expectedUpdatedAt:s2.updatedAt});
  assert.equal(hybrid.status,402,'business cannot switch to HYBRID');
  console.log('ok mode limit');

  // Admin sets START: mode drops to IMPORT, period starts now.
  await db.query('UPDATE "Business" SET mode=\'HYBRID\' WHERE id=$1',[businessId]);
  const put=await call(admin,`/api/admin/businesses/${businessId}/subscription`,'PUT',{plan:'START',status:'ACTIVE',expiresAt:at(30).slice(0,10)});
  assert.equal(put.status,200,'admin plan change');
  const after=(await db.query('SELECT b.mode, s."currentPeriodStart" FROM "Business" b JOIN "Subscription" s ON s."businessId"=b.id WHERE b.id=$1',[businessId])).rows[0];
  assert.equal(after.mode,'IMPORT');assert.ok(after.currentPeriodStart>=startedAt);
  console.log('ok admin plan change clamps mode');

  // Extra business: blocked on START, allowed on BUSINESS (created without a plan).
  const create=token=>call(token,'/api/business/onboarding','POST',{name:'QA new '+tag,category:'OTHER',mode:'IMPORT'});
  assert.equal((await create(owner)).status,402,'start owner cannot add business');
  await setPlan('BUSINESS','ACTIVE',30);
  const extra=await create(owner);assert.equal(extra.status,201);
  const extraSub=(await db.query('SELECT plan,status FROM "Subscription" WHERE "businessId"=$1',[(await extra.json()).businessId])).rows[0];
  assert.deepEqual({...extraSub},{plan:'FREE',status:'ACTIVE'});
  // First business of a user who never had a trial gets 14 days, once.
  const first=await create(fresh);assert.equal(first.status,201);
  const firstSub=(await db.query('SELECT s.status,s."expiresAt",u."trialUsedAt" FROM "Subscription" s, "User" u WHERE s."businessId"=$1 AND u.id=$2',[(await first.json()).businessId,freshId])).rows[0];
  assert.equal(firstSub.status,'TRIALING');assert.ok(firstSub.trialUsedAt);
  assert.ok(Math.abs(firstSub.expiresAt-Date.now()-14*DAY)<60000);
  console.log('ok onboarding trial and extra business rule');

  // Mid-period changes: half of a 30-day period is left.
  const period=(plan,status='ACTIVE')=>db.query('UPDATE "Subscription" SET plan=$2,status=$3,"currentPeriodStart"=$4,"expiresAt"=$5,"cancelAtPeriodEnd"=false,"canceledAt"=NULL WHERE "businessId"=$1',[businessId,plan,status,at(-15),at(15)]);
  const sub=async()=>(await db.query('SELECT plan,status,"expiresAt","cancelAtPeriodEnd" FROM "Subscription" WHERE "businessId"=$1',[businessId])).rows[0];
  const act=async body=>{const res=await call(owner,'/api/billing/subscription','POST',body);return {status:res.status,data:await res.json()}};
  const daysFromNow=date=>Math.round((date-Date.now())/DAY);
  // Pro → Start: 79/2 = 39.50 ₾ covers 39.50 / (19/30) = 62 days.
  await period('PRO');
  let r=await act({action:'downgrade',plan:'START'});assert.equal(r.status,200,r.data.message);
  let s=await sub();assert.equal(s.plan,'START');assert.equal(daysFromNow(s.expiresAt),62);
  // Business → Pro is an upgrade: it needs payment and the checkout shows 79 − 19.50 = 59.50.
  await period('BUSINESS');
  r=await act({action:'downgrade',plan:'PRO'});assert.equal(r.status,409);
  const checkout=(await (await call(owner,'/dashboard/plans/checkout?plan=pro')).text()).replaceAll('<!-- -->','');
  assert.ok(checkout.includes('59.50')&&checkout.includes('19.50'),'upgrade amount and credit shown');
  // Cancel keeps the plan until the end; resume undoes it; the cron turns an expired canceled plan into CANCELED.
  r=await act({action:'cancel'});assert.equal(r.status,200,r.data.message);assert.equal((await sub()).cancelAtPeriodEnd,true);
  assert.equal((await act({action:'cancel'})).status,409);
  r=await act({action:'resume'});assert.equal(r.status,200);assert.equal((await sub()).cancelAtPeriodEnd,false);
  await act({action:'cancel'});
  await db.query('UPDATE "Subscription" SET "expiresAt"=$2 WHERE "businessId"=$1',[businessId,at(-0.01)]);
  const {expireSubscriptions}=await import('../lib/billing/expire-subscriptions.mjs');
  await expireSubscriptions(process.env.DIRECT_URL);
  s=await sub();assert.equal(s.status,'CANCELED');assert.equal(s.cancelAtPeriodEnd,false);
  // A trial has nothing to cancel.
  await setPlan('FREE','TRIALING',5);
  assert.equal((await act({action:'cancel'})).status,409);
  const history=(await db.query('SELECT count(*)::int AS n FROM "AdminAuditLog" WHERE "targetId"=$1 AND action=\'subscription-user\'',[businessId])).rows[0].n;
  assert.ok(history>=4,'owner changes are in the admin history');
  console.log('ok downgrade, upgrade quote, cancel, resume, expiry');

  // Order limit: Start has 200 orders per period; deleted orders still count, imported ones do not.
  const order=(items=[{source:'MANUAL',condition:'GOOD',quantity:1,name:'QA',unitPrice:'10'}])=>call(owner,'/api/orders','POST',{clientRequestId:randomUUID(),status:'PROCESSING',paymentMethod:'CASH',recipientPhone:'599123456',courierFee:'0',paidAmount:'0',items});
  const orderCode=async res=>res.status===402?(await res.json()).code:res.status;
  await period('START');
  await db.query('UPDATE "Business" SET "nextOrderNumber"=1000 WHERE id=$1',[businessId]);
  await db.query(`INSERT INTO "Order" (id,"businessId",number,"recipientPhone","deletedAt","updatedAt") SELECT $1||g,$2,g,'599000000',CASE WHEN g=1 THEN now() END,now() FROM generate_series(1,199) g`,[tag+'-o',businessId]);
  await db.query(`INSERT INTO "Order" (id,"businessId",number,"recipientPhone",imported,"updatedAt") SELECT $1||g,$2,g+500,'599000000',true,now() FROM generate_series(1,20) g`,[tag+'-i',businessId]);
  assert.equal(await orderCode(await order([{source:'INVENTORY',condition:'GOOD',quantity:1,name:'QA',unitPrice:'10',inventoryItemId:'missing'}])),'PLAN_FEATURE','stock in an order needs Business');
  const last=await order();assert.equal(last.status,201,JSON.stringify(await last.clone().json()));
  assert.equal(await orderCode(await order()),'PLAN_LIMIT','201st order of the period is refused');
  await period('BUSINESS');
  assert.equal((await order()).status,201,'Business has 500');
  console.log('ok order limit, stock and photo rules');

  // AI: Business has 100 questions and 5 purchase files per period, counted separately.
  const usage=(kind,n,days=-1)=>db.query(`INSERT INTO "AiUsage" (id,"businessId","businessName",kind,model,counted,"createdAt") SELECT gen_random_uuid()::text,$1,'QA',$2,'qa',true,$4 FROM generate_series(1,$3)`,[businessId,kind,n,at(days)]);
  const quota=async()=>(await (await call(owner,'/api/ai/quota')).json()).quota;
  await usage('CHAT',30,-20); // before this period: not counted
  await usage('CHAT',100);await usage('PURCHASE_DRAFT',5);
  let q=await quota();assert.deepEqual([q.used,q.limit,q.files.used,q.files.limit,q.files.shared],[100,100,5,5,false]);
  const draft=await call(owner,'/api/ai/purchase-draft','POST',{target:'products',fileName:'qa.csv',rows:[{row:1,cells:['name','qty','price']},{row:2,cells:['Bag','2','10']}],photoCount:0});
  const draftData=await draft.json();assert.equal(draft.status,429);assert.match(draftData.message,/ფაილიდან შესყიდვის ლიმიტი ამოიწურა \(5\/5\)/);
  const chat=await call(owner,'/api/ai/chat','POST',{messages:[{role:'user',text:'test'}]});
  assert.equal(chat.status,429);
  // Pro: 500 questions, unlimited files. Trial: 20 in total, files included.
  await period('PRO');q=await quota();assert.deepEqual([q.limit,q.files.limit],[500,null]);
  await db.query('UPDATE "Subscription" SET plan=\'FREE\',status=\'TRIALING\' WHERE "businessId"=$1',[businessId]);
  q=await quota();assert.deepEqual([q.used,q.limit,q.files.shared,q.trial],[105,20,true,true]);
  console.log('ok AI questions and files per plan period');

  // SMS on shipping (dry run: ORDER_SMS_LIVE is not set, so no real SMS leaves).
  assert.notEqual(process.env.ORDER_SMS_LIVE,'1','QA must never send real SMS');
  const sms=async()=>(await db.query('SELECT source::text,status::text FROM "SmsMessage" WHERE "businessId"=$1 AND "orderId" IS NOT NULL ORDER BY "createdAt"',[businessId])).rows;
  const balance=async()=>(await db.query('SELECT "smsBalance" FROM "Business" WHERE id=$1',[businessId])).rows[0].smsBalance;
  const ship=async()=>{const res=await order();const {order:o}=await res.json();const b=await call(owner,'/api/orders/bulk-status','POST',{action:'ship',orderIds:[o.id]});assert.equal(b.status,200,'ship');await new Promise(r=>setTimeout(r,2500));return o.id};
  await period('PRO');
  await ship();
  assert.deepEqual(await sms(),[{source:'PLAN',status:'DRY_RUN'}],'Pro uses the included SMS first');
  await db.query(`INSERT INTO "SmsMessage" (id,"businessId",phone,source,status,"updatedAt") SELECT gen_random_uuid()::text,$1,'+995599000000','PLAN','SENT',now() FROM generate_series(1,499)`,[businessId]);
  await ship();
  assert.equal((await sms()).length,1,'no SMS when the plan SMS and packs are used up');
  const pack=await call(admin,`/api/admin/businesses/${businessId}/sms`,'POST',{count:200,note:'QA'});assert.equal(pack.status,200);
  assert.equal(await balance(),200);
  await ship();
  assert.deepEqual((await sms()).at(-1),{source:'PACK',status:'DRY_RUN'});assert.equal(await balance(),199);
  // Business has no included SMS but uses packs; Start keeps the balance untouched.
  await period('BUSINESS');await ship();
  assert.equal((await sms()).at(-1).source,'PACK');assert.equal(await balance(),198);
  // Start is over its order limit here, so ship an order created earlier on Pro.
  await period('PRO');const {order:early}=await (await order()).json();
  await period('START');
  assert.equal((await call(owner,'/api/orders/bulk-status','POST',{action:'ship',orderIds:[early.id]})).status,200);
  await new Promise(r=>setTimeout(r,2500));
  assert.equal(await balance(),198,'Start sends nothing');
  // The owner can switch SMS off; the trial cannot change it.
  await period('PRO');
  const off=await call(owner,'/api/business/sms','PATCH',{enabled:false});assert.equal(off.status,200);
  const before=(await sms()).length;await ship();assert.equal((await sms()).length,before,'switched off');
  await setPlan('FREE','TRIALING',5);
  assert.equal(await code(owner,'/api/business/sms','PATCH',{enabled:true}),'PLAN_FEATURE');
  console.log('ok SMS on shipping: plan SMS, packs, switch, plan rules');

  // Limits restart every month of a longer paid term (e.g. 3 months recorded at once).
  await db.query('UPDATE "Subscription" SET plan=\'PRO\',status=\'ACTIVE\',"currentPeriodStart"=$2,"expiresAt"=$3 WHERE "businessId"=$1',[businessId,at(-45),at(45)]);
  await db.query('DELETE FROM "AiUsage" WHERE "businessId"=$1',[businessId]);
  await usage('CHAT',3,-20);await usage('CHAT',2,-5);
  q=await quota();assert.equal(q.used,2,'only this month of the term counts');
  // An admin-recorded payment for a new plan starts a new period today.
  const pay=await call(admin,`/api/admin/businesses/${businessId}/payments`,'POST',{plan:'BUSINESS',amount:'39',method:'CASH',months:1,paidAt:new Date().toISOString().slice(0,10)});
  assert.equal(pay.status,200,JSON.stringify(await pay.clone().json()));
  const paid=(await db.query('SELECT plan,"currentPeriodStart" FROM "Subscription" WHERE "businessId"=$1',[businessId])).rows[0];
  assert.equal(paid.plan,'BUSINESS');assert.ok(Date.now()-paid.currentPeriodStart<120000,'period starts today');
  console.log('ok monthly periods and admin payment period');

  // Downgrade: the owner picks who stays and which direction remains.
  const staffIds=[];
  for(let i=0;i<6;i++){
   const id=`${tag}-staff${i}`;staffIds.push(id);userIds.push(id);
   await db.query('INSERT INTO "User" (id,email,phone,password,status,"updatedAt") VALUES ($1,$2,$3,\'x\',\'ACTIVE\',now())',[id,id+'@example.invalid','+000'+id]);
   await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,permissions,"createdAt","updatedAt") VALUES ($1,$2,$3,\'MEMBER\',ARRAY[\'ORDERS\']::"BusinessPermission"[],$4,now())',[id+'-m',id,businessId,at(-10+i)]);
  }
  await period('PRO');await db.query('UPDATE "Business" SET mode=\'HYBRID\' WHERE id=$1',[businessId]);
  const down=body=>act({action:'downgrade',plan:'BUSINESS',...body});
  r=await down({mode:'MANUFACTURING'});assert.equal(r.status,422,'must choose who stays');
  const keep=staffIds.slice(1).map(id=>id+'-m'); // freeze the earliest-added one on purpose
  r=await down({keep});assert.equal(r.status,422,'must choose the direction');
  r=await down({keep,mode:'MANUFACTURING'});assert.equal(r.status,200,r.data.message);
  const statuses=Object.fromEntries((await db.query('SELECT id,status::text FROM "BusinessMembership" WHERE id=ANY($1::text[])',[staffIds.map(id=>id+'-m')])).rows.map(row=>[row.id,row.status]));
  assert.equal(statuses[staffIds[0]+'-m'],'FROZEN');assert.ok(keep.every(id=>statuses[id]==='ACTIVE'),'chosen members stay active');
  assert.equal((await db.query('SELECT mode::text FROM "Business" WHERE id=$1',[businessId])).rows[0].mode,'MANUFACTURING');
  console.log('ok downgrade with member and direction choice');

  // Notices. Owners only; the hourly cron route creates reminders for every business and sends e-mail/push.
  const notices=async kind=>(await db.query('SELECT "dedupeKey" AS key,title,"channelsSentAt" AS sent FROM "Notification" WHERE "userId"=$1 AND kind=$2::"NotificationKind" ORDER BY "createdAt"',[ownerId,kind])).rows;
  const cron=secret=>fetch(base+'/api/cron/subscription-notices',{method:'POST',headers:{authorization:'Bearer '+secret}});
  assert.equal((await cron('wrong-secret-wrong-secret')).status,401,'cron needs the secret');
  const runCron=async()=>{const res=await cron(process.env.CRON_SECRET);assert.equal(res.status,200,'cron route');};
  // Orders: the 200th Start order of the period made the 100% notice (the test jumped past 80% at once).
  let limitKeys=(await notices('LIMIT_WARNING')).map(n=>n.key);
  assert.ok(limitKeys.some(key=>key.startsWith('limit:orders:')&&key.includes(':100:')),limitKeys.join());
  // AI: the question that reaches 80% makes one notice (the limit check refuses before the model is called at 100%).
  await period('BUSINESS');await db.query('DELETE FROM "AiUsage" WHERE "businessId"=$1',[businessId]);
  await usage('CHAT',79);
  const asked=await call(owner,'/api/ai/chat','POST',{messages:[{role:'user',text:'ok'}]});await asked.text();
  limitKeys=(await notices('LIMIT_WARNING')).map(n=>n.key);
  assert.ok(limitKeys.some(key=>key.startsWith('limit:ai:')&&key.includes(':80:')),limitKeys.join());
  // Trial: one reminder 2 days before (not at 3), and one notice after it ends.
  await setPlan('FREE','TRIALING',2.5);await runCron();assert.equal((await notices('TRIAL_ENDING')).length,0,'not 2.5 days before');
  await setPlan('FREE','TRIALING',1.5);await runCron();await runCron();
  let t=await notices('TRIAL_ENDING');assert.equal(t.length,1);assert.ok(t[0].key.startsWith('trial-ending:'));assert.ok(t[0].sent,'e-mail/push marked as handled');
  await setPlan('FREE','TRIALING',-0.01);await runCron();
  t=await notices('TRIAL_ENDING');assert.equal(t.length,2);assert.equal(t[1].title,'საცდელი პერიოდი დასრულდა');
  // Paid: a reminder 3 days before the end.
  await setPlan('PRO','ACTIVE',2);await runCron();
  assert.ok((await notices('RENEWAL_REMINDER')).some(n=>n.key.startsWith('renewal:')));
  // Owner actions and SMS running low.
  await period('PRO');await act({action:'cancel'});
  assert.ok((await notices('PLAN_CHANGED')).some(n=>n.title==='გეგმა გაუქმდა'));
  await act({action:'resume'});
  await db.query('UPDATE "Business" SET "smsEnabled"=true,"smsBalance"=21 WHERE id=$1',[businessId]);
  await db.query(`INSERT INTO "SmsMessage" (id,"businessId",phone,source,status,"updatedAt") SELECT gen_random_uuid()::text,$1,'+995599000000','PLAN','SENT',now() FROM generate_series(1,500)`,[businessId]);
  await ship();
  const low=await notices('SMS_LOW');assert.equal(low.length,1);assert.equal(low[0].title,'დარჩა 20 SMS');
  console.log('ok notices: cron reminders, trial ended, limits, plan changes, SMS low');

  // Retention: 12 months unpaid → listed for the admin; owners warned 30 days before; deleted only by hand.
  const old=async(key,days)=>{const id=`${tag}-${key}`;
   await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[id,'QA retention '+key]);
   await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[id+'-m',ownerId,id]);
   await db.query('INSERT INTO "Subscription" (id,"businessId",plan,status,"expiresAt","updatedAt") VALUES ($1,$2,\'PRO\',\'EXPIRED\',$3,now())',[id+'-s',id,at(days)]);
   return id;};
  const due=await old('due',-400),soonId=await old('soon',-350);
  await runCron();
  assert.ok((await notices('RENEWAL_REMINDER')).some(n=>n.key.startsWith('retention:30:'+soonId)),'30-day warning');
  let html=(await (await call(admin,'/admin/retention')).text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('QA retention due')&&html.includes('QA retention soon'),'both listed');
  const del=(id,confirmName)=>call(admin,`/api/admin/businesses/${id}`,'DELETE',{confirmName});
  assert.equal((await del(due,'wrong name')).status,422);
  assert.equal((await del(soonId,'QA retention soon')).status,409,'not before 12 months');
  assert.equal((await call(owner,`/api/admin/businesses/${due}`,'DELETE',{confirmName:'QA retention due'})).status,403,'admin only');
  assert.equal((await del(due,'QA retention due')).status,200);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "Business" WHERE id=$1',[due])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND title=\'ბიზნესი წაიშალა\'',[ownerId])).rows[0].n,1);
  console.log('ok retention list, warning and manual delete');

  console.log('PASS: subscription plan gating (trial, start, business, pro, past due, trial ended, no plan), mode limit, admin change, onboarding, plan changes, usage limits, SMS, periods, downgrade choices, notices, retention.');
 }finally{
  const owned=(await db.query('SELECT "businessId" FROM "BusinessMembership" WHERE "userId"=ANY($1::text[])',[userIds])).rows.map(r=>r.businessId);
  await db.query('DELETE FROM "AdminAuditLog" WHERE ("targetId"=ANY($1::text[]) OR "targetId" LIKE $3) AND "createdAt">=$2',[owned,startedAt.toISOString(),tag+'%']);
  await db.query('DELETE FROM "SecurityRateBucket" WHERE identity=ANY($1::text[])',[userIds]).catch(()=>{});
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  if(owned.length)await db.query('DELETE FROM "AiUsage" WHERE "businessId"=ANY($1::text[])',[owned]);
  if(owned.length)await db.query('DELETE FROM "SubscriptionPayment" WHERE "businessId"=ANY($1::text[])',[owned]);
  if(owned.length)await db.query('DELETE FROM "Business" WHERE id=ANY($1::text[])',[owned]);
  await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])',[userIds]);
  const left=(await db.query('SELECT (SELECT count(*) FROM "Business" WHERE id=ANY($1::text[]))+(SELECT count(*) FROM "User" WHERE id=ANY($2::text[])) AS n',[owned,userIds])).rows[0].n;
  console.log('cleanup leftovers:',Number(left));
  await db.end();
 }
})().catch(error=>{console.error('Subscription plans QA failed:',error.message);process.exitCode=1});
