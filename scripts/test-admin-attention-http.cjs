/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with temporary businesses, an owner and sessions. */
require('dotenv').config({quiet:true});
const {Client,types}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
const DAY=86400000,at=days=>new Date(Date.now()+days*DAY).toISOString();

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='risk-qa-'+randomUUID().slice(0,8),ownerId=tag+'-owner',sessionIds=[],businessIds=[];
 const startedAt=new Date();
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(admins.length,1);
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now(),now(),now())',[ownerId,tag+'@example.invalid','+000'+tag,'disabled-qa-password']);
  // One business per signal, plus cases that must not be flagged.
  async function business(key,{createdDays=0,plan=null,status='ACTIVE',expiresDays=null,canceled=false,aiLimit=null}={}){
   const id=`${tag}-${key}`,name=`QA ${key} ${tag}`;businessIds.push(id);
   await db.query('INSERT INTO "Business" (id,name,"createdAt","updatedAt","aiMonthlyLimit") VALUES ($1,$2,$3,now(),$4)',[id,name,at(createdDays),aiLimit]);
   await db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[id+'-m',ownerId,id]);
   if(plan)await db.query('INSERT INTO "Subscription" (id,"businessId",plan,status,"expiresAt","canceledAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())',[id+'-s',id,plan,status,expiresDays===null?null:at(expiresDays),canceled?at(-3):null]);
   return {id,name};
  }
  const lapsed=await business('lapsed',{createdDays:-60,plan:'PRO',status:'PAST_DUE',expiresDays:-2});
  const trialEnded=await business('trial',{createdDays:-1,plan:'BUSINESS',status:'EXPIRED',expiresDays:-1});
  const expiring=await business('expiring',{plan:'START',expiresDays:3});
  const inactive=await business('inactive',{createdDays:-40,plan:'PRO',expiresDays:60});
  const onboarding=await business('onboarding',{createdDays:-5});
  const aiLimit=await business('ai',{aiLimit:1});
  const fresh=await business('fresh');
  const canceled=await business('canceled',{createdDays:-1,plan:'PRO',status:'CANCELED',expiresDays:-2,canceled:true});
  const oldLapse=await business('oldlapse',{createdDays:-1,plan:'PRO',status:'EXPIRED',expiresDays:-45});
  await db.query('INSERT INTO "AiUsage" (id,"businessId","businessName","kind",model,counted) VALUES ($1,$2,$3,\'CHAT\',\'qa\',true)',[tag+'-ai',aiLimit.id,aiLimit.name]);
  // Chat context for the lapsed business: a payment, an admin action and a conversation.
  await db.query('INSERT INTO "SubscriptionPayment" (id,"businessId","businessName",plan,amount,method,months,"paidAt","periodStart","periodEnd") VALUES ($1,$2,$3,\'PRO\',79.50,\'BANK_TRANSFER\',1,$4,$4,$5)',[tag+'-p',lapsed.id,lapsed.name,at(-32),at(-2)]);
  await db.query('INSERT INTO "AdminAuditLog" (id,"adminId",action,"targetType","targetId",after) VALUES ($1,$2,\'ai-settings\',\'BUSINESS\',$3,$4)',[tag+'-a',admins[0].id,lapsed.id,JSON.stringify({disabled:false,monthlyLimit:null})]);
  await db.query('INSERT INTO "SupportConversation" (id,"businessId","updatedAt") VALUES ($1,$2,now())',[tag+'-c',lapsed.id]);

  async function session(userId){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),at(1)]);return token}
  const adminToken=await session(admins[0].id),ownerToken=await session(ownerId);
  const get=(p,token)=>fetch(base+p,{redirect:'manual',headers:{Cookie:'marteo_session='+token}});
  const page=async p=>{const res=await get(p,adminToken);assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};
  // One business row: from its name to its chat button, which closes the row.
  const row=(html,name)=>{const start=html.indexOf(name);if(start<0)return null;return html.slice(start,html.indexOf('</button>',start))};

  let html=await page('/admin/attention');
  const expect={
   [lapsed.name]:['გადახდა არ შემოსულა: PRO დასრულდა 2 დღის წინ'],
   [trialEnded.name]:['გადახდა არ შემოსულა: BUSINESS დასრულდა 1 დღის წინ'],
   [expiring.name]:['პაკეტი იწურება: START იწურება 3 დღეში'],
   [inactive.name]:['ფასიანი, მაგრამ არააქტიური: შეკვეთა ჯერ არ აქვს'],
   [onboarding.name]:['პირველი შეკვეთა არ აქვს: დარეგისტრირდა 5 დღის წინ'],
   [aiLimit.name]:['AI ლიმიტი ამოიწურა: ამ თვეში 1/1'],
  };
  for(const [name,labels] of Object.entries(expect)){
   const text=row(html,name);assert.ok(text,`${name} listed`);
   for(const label of labels)assert.ok(text.includes(label),`${name}: ${label}`);
  }
  // A paid lapse is not also "inactive" (its plan is FREE now); the lapsed business has only its one signal.
  assert.ok(!row(html,lapsed.name).includes('არააქტიური'));
  for(const name of [fresh.name,canceled.name,oldLapse.name])assert.equal(row(html,name),null,`${name} not listed`);
  assert.ok(row(html,lapsed.name).includes('ჩათის გახსნა')&&row(html,expiring.name).includes('ჩათის დაწყება'));

  html=await page('/admin/attention?kind=expiring');
  assert.ok(row(html,expiring.name));assert.equal(row(html,onboarding.name),null);
  assert.ok(html.includes('7 დღეში იწურება'));
  html=await page('/admin/attention?kind=bogus');assert.ok(row(html,onboarding.name),'unknown kind shows all');
  html=await page('/admin');assert.ok(html.includes('ყურადღება სჭირდება')&&html.includes('href="/admin/attention"'));
  assert.equal((await get('/admin/attention',ownerToken)).status,404);

  // Support chat side panel: signals, AI use, last payment, admin actions.
  html=await page(`/admin/support/${tag}-c`);
  for(const t of ['ანგარიში','გადახდა არ შემოსულა: PRO დასრულდა 2 დღის წინ','FREE · PRO გადაუხდელი','მართეო AI ამ თვეში','0 / 0','79.50 ₾ · PRO 1 თვე','ადმინის ბოლო ქმედებები','AI-ის პარამეტრები შეიცვალა'])assert.ok(html.includes(t),t);

  console.log('PASS: risk signals (lapsed, trial ended, expiring, inactive, onboarding, AI limit), exclusions, filters, overview card, admin-only, chat account panel.');
 }finally{
  await db.query('DELETE FROM "AdminAuditLog" WHERE id=$1 OR ("targetId"=ANY($2::text[]) AND "createdAt">=$3)',[tag+'-a',businessIds,startedAt.toISOString()]);
  await db.query('DELETE FROM "SubscriptionPayment" WHERE "businessName" LIKE $1',['%'+tag]);
  await db.query('DELETE FROM "AiUsage" WHERE "businessName" LIKE $1',['%'+tag]);
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  if(businessIds.length)await db.query('DELETE FROM "Business" WHERE id=ANY($1::text[])',[businessIds]);
  await db.query('DELETE FROM "User" WHERE id=$1',[ownerId]);
  const left=(await db.query('SELECT (SELECT count(*) FROM "Business" WHERE id LIKE $1)+(SELECT count(*) FROM "AiUsage" WHERE "businessName" LIKE $2)+(SELECT count(*) FROM "SubscriptionPayment" WHERE "businessName" LIKE $2)+(SELECT count(*) FROM "User" WHERE id=$3) AS n',[tag+'%','%'+tag,ownerId])).rows[0].n;
  console.log('cleanup leftovers:',Number(left));
  await db.end();
 }
})().catch(error=>{console.error('Admin attention QA failed:',error.message);process.exitCode=1});
