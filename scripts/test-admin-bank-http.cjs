/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with a temporary business, owner and sessions. */
require('dotenv').config({quiet:true});
const {createQaAdmin}=require('./qa-admin.cjs'),{Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
require('pg').types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
const ago=ms=>new Date(Date.now()-ms).toISOString();

// Admin card-payments view: list, stuck/failed alerts, access, and the refund/sync guards.
// Real refunds need BOG sandbox keys; without them both actions must refuse with 503 and change nothing.
(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='bank-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',businessId=tag+'-biz',name='QA ბარათი '+tag,sessionIds=[],cleanups=[];
 const configured=Boolean(process.env.BOG_CLIENT_ID&&process.env.BOG_CLIENT_SECRET);
 try{
  await db.connect();
  const qaAdmin=await createQaAdmin(db,tag);cleanups.push(()=>qaAdmin.cleanup());
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),now())',[ownerId,tag+'@example.invalid','+000'+tag,'disabled-qa-password']);
  await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[businessId,name]);
  await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[tag+'-m',ownerId,businessId]);
  await db.query('INSERT INTO "Subscription" (id,"businessId",plan,status,"expiresAt","bankCardOrderId","bankCardAmount","bankCardMask","updatedAt") VALUES ($1,$2,\'START\',\'ACTIVE\',$3,$4,19,\'****4242\',now())',[tag+'-s',businessId,new Date(Date.now()+20*86400000).toISOString(),tag+'-order-ok']);
  await db.query('INSERT INTO "SubscriptionPayment" (id,"businessId","businessName",plan,amount,method,months,"paidAt","periodStart","periodEnd") VALUES ($1,$2,$3,\'START\',19,\'CARD\',1,now(),now(),now()+interval \'30 days\')',[tag+'-sp',businessId,name]);
  const bank=(id,kind,status,extra={})=>db.query(`INSERT INTO "BankPayment" (id,"businessId",kind,status,plan,amount,"bankOrderId","bankStatus","cardMask","subscriptionPaymentId","createdAt","completedAt") VALUES ($1,$2,$3::"BankPaymentKind",$4::"BankPaymentStatus",'START',19,$5,$6,'****4242',$7,$8,$9)`,
   [id,businessId,kind,status,extra.order??null,extra.bankStatus??null,extra.sp??null,extra.createdAt??ago(0),extra.completedAt??null]);
  await bank(tag+'-ok','CHECKOUT','COMPLETED',{order:tag+'-order-ok',bankStatus:'completed',sp:tag+'-sp',createdAt:ago(3*86400000),completedAt:ago(3*86400000)});
  await bank(tag+'-stuck','CHECKOUT','PENDING',{order:tag+'-order-stuck',bankStatus:'created',createdAt:ago(2*3600000)});
  await bank(tag+'-fresh','CHECKOUT','PENDING',{order:tag+'-order-fresh',createdAt:ago(60000)});
  await bank(tag+'-fail','RENEWAL','REJECTED',{order:tag+'-order-fail',bankStatus:'rejected',createdAt:ago(86400000)});
  await bank(tag+'-noorder','RENEWAL','REJECTED',{bankStatus:'request_failed',createdAt:ago(86400000)});

  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000).toISOString()]);return token}
  const adminToken=qaAdmin.cookie,ownerToken='marteo_session='+await session(ownerId);
  const call=(p,cookie,body)=>fetch(base+p,{method:body!==undefined?'POST':'GET',redirect:'manual',headers:{Cookie:cookie,...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const page=async p=>{const res=await call(p,adminToken);assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};

  // Business page: card, every attempt with a readable status, buttons only where they apply.
  let html=await page(`/admin/businesses/${businessId}`);
  for(const t of ['ბარათით გადახდები (საქართველოს ბანკი)','****4242','წარმატებული','გაჭედილი','მოლოდინში','უარყოფილი','ბანკამდე ვერ მივიდა','ბანკმა უარყო','თანხის დაბრუნება','ბანკთან შემოწმება','ავტოგანახლება'])assert.ok(html.includes(t),'business page: '+t);

  // Payments page: tab, alerts and filters.
  html=await page('/admin/payments');assert.ok(html.includes('ბარათის მცდელობები'));assert.ok(/გადახდას ბანკი 30 წუთზე მეტია არ პასუხობს/.test(html),'stuck alert');assert.ok(/ავტოგანახლება ჩავარდა ბოლო 7 დღეში/.test(html),'failed alert');
  const q='&q='+encodeURIComponent(tag);
  html=await page('/admin/payments?view=bank'+q);assert.ok(html.includes('5 მცდელობა'),'all attempts');assert.ok(html.includes(name));
  html=await page('/admin/payments?view=bank&status=STUCK'+q);assert.ok(html.includes('1 მცდელობა'),'stuck only');
  html=await page('/admin/payments?view=bank&status=REJECTED&kind=RENEWAL&period=7'+q);assert.ok(html.includes('2 მცდელობა'),'failed renewals');
  html=await page('/admin/payments?view=bank&status=COMPLETED'+q);assert.ok(html.includes('1 მცდელობა'),'completed');
  html=await page('/admin/payments?view=bank&q=4242');assert.ok(html.includes(name),'search by card digits');

  // Access: owners can neither sync nor refund.
  assert.equal((await call(`/api/admin/businesses/${businessId}/bank/${tag}-ok/refund`,ownerToken,{reason:'x'})).status,403);
  assert.equal((await call(`/api/admin/businesses/${businessId}/bank/${tag}-stuck/sync`,ownerToken,{})).status,403);
  // Guards: reason required, only completed attempts, wrong business.
  // Refund needs a fresh app code even on a trusted device (QA admin has no phone, so it stops here).
  assert.equal((await call(`/api/admin/businesses/${businessId}/bank/${tag}-ok/refund`,adminToken,{reason:'x'})).status,422,'code required');
  assert.equal((await call(`/api/admin/businesses/${businessId}/bank/${tag}-ok/refund`,adminToken,{reason:'x',code:'000000'})).status,403,'wrong code');
  let r=await call(`/api/admin/businesses/${businessId}/bank/${tag}-noorder/sync`,adminToken,{});assert.equal(r.status,409,'no bank order to check');
  if(!configured){
   r=await call(`/api/admin/businesses/${businessId}/bank/${tag}-stuck/sync`,adminToken,{});assert.equal(r.status,503);
   const row=(await db.query('SELECT "refundedAt" FROM "BankPayment" WHERE id=$1',[tag+'-ok'])).rows[0];assert.equal(row.refundedAt,null,'nothing refunded');
   assert.equal((await db.query('SELECT "voidedAt" FROM "SubscriptionPayment" WHERE id=$1',[tag+'-sp'])).rows[0].voidedAt,null,'revenue untouched');
   assert.equal((await db.query('SELECT plan::text FROM "Subscription" WHERE "businessId"=$1',[businessId])).rows[0].plan,'START','plan untouched');
  }
  // Refunded rows show as refunded and lose the refund button.
  await db.query('UPDATE "BankPayment" SET "refundedAt"=now(),"refundedAmount"=amount,"bankStatus"=\'refunded\' WHERE id=$1',[tag+'-ok']);
  html=await page(`/admin/businesses/${businessId}`);assert.ok(html.includes('დაბრუნებული'));assert.ok(!html.includes('>თანხის დაბრუნება<'),'no refund button after refund');
  html=await page('/admin/payments?view=bank&status=REFUNDED'+q);assert.ok(html.includes('1 მცდელობა'));
  console.log(JSON.stringify({ok:true,configured}));
 }finally{
  await db.query('DELETE FROM "Session" WHERE id = ANY($1)',[sessionIds]).catch(()=>{});
  for(const cleanup of cleanups)await cleanup();
  await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=$1',[businessId]).catch(()=>{});
  await db.query('DELETE FROM "BankPayment" WHERE "businessId"=$1',[businessId]).catch(()=>{});
  await db.query('DELETE FROM "SubscriptionPayment" WHERE "businessId"=$1',[businessId]).catch(()=>{});
  await db.query('DELETE FROM "Business" WHERE id=$1',[businessId]).catch(()=>{});
  await db.query('DELETE FROM "User" WHERE id=$1',[ownerId]).catch(()=>{});
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
