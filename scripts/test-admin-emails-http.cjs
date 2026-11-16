/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of the e-mail log. */
// Run the server with DEV_DELIVERY=console: nothing is really sent. The "limited" path is the real code path
// (our cooldown bucket is pre-filled for a temporary address); sent/failed rows are inserted directly.
require('dotenv').config({quiet:true});
const {createQaAdmin}=require('./qa-admin.cjs');
const {Client}=require('pg'),{randomUUID,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const bucket=(scope,identity)=>scope+':'+createHash('sha256').update(identity).digest('hex');

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='mail-qa-'+randomUUID().slice(0,8),userId=tag+'-user',email=`${tag}@example.invalid`,cleanups=[];
 try{
  await db.connect();
  const qaAdmin=await createQaAdmin(db,tag);cleanups.push(()=>qaAdmin.cleanup());
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"firstName","emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,\'qa-password-hash\',\'ACTIVE\',\'QA\',now(),now(),now())',[userId,email,'+000'+tag]);
  // Our per-address cooldown is already used: the reset e-mail must be refused and logged as LIMITED.
  await db.query('INSERT INTO "SecurityRateBucket" ("key",count,"expiresAt") VALUES ($1,1,(now() AT TIME ZONE \'UTC\') + interval \'5 minutes\') ON CONFLICT ("key") DO UPDATE SET count=1,"expiresAt"=EXCLUDED."expiresAt"',[bucket('email-cooldown',email)]);
  let r=await fetch(base+'/api/auth/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email})});
  assert.ok(r.ok,'reset request answers as usual: '+r.status);
  let rows=(await db.query('SELECT kind,status,recipient,"providerId",error FROM "EmailLog" WHERE recipient=$1',[email])).rows;
  assert.equal(rows.length,1,'one log row');assert.equal(rows[0].kind,'password-reset');assert.equal(rows[0].status,'LIMITED');
  assert.equal(rows[0].providerId,null);assert.match(rows[0].error,/^[\w.-]+$/,'only an error type is stored');

  const insert=(kind,status,minutesAgo,extra={})=>db.query('INSERT INTO "EmailLog" (id,kind,recipient,status,"providerId",error,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,(now() AT TIME ZONE \'UTC\') - make_interval(mins => $7))',
   [tag+'-'+randomUUID().slice(0,6),kind,email,status,extra.providerId??null,extra.error??null,minutesAgo]);
  await insert('verification','SENT',30,{providerId:'qa-resend-id'});
  await insert('notice','FAILED',10,{error:'validation_error'});

  const page=async p=>{const res=await fetch(base+p,{redirect:'manual',headers:{Cookie:qaAdmin.cookie}});assert.equal(res.status,200,p);return (await res.text()).replaceAll('<!-- -->','')};
  let html=await page(`/admin/users/${userId}`);
  for(const t of ['ელფოსტები','პაროლის აღდგენა','ლიმიტი (არ გაიგზავნა)','დადასტურების კოდი','გაიგზავნა','ვერ გაიგზავნა','validation_error'])assert.ok(html.includes(t),'user page: '+t);
  html=await page('/admin/emails?q='+encodeURIComponent(tag));assert.ok(html.includes('3 წერილი'),'search by address');assert.ok(html.includes(email));
  html=await page('/admin/emails?status=FAILED&q='+encodeURIComponent(tag));assert.ok(html.includes('1 წერილი'),'status filter');
  html=await page('/admin/emails?kind=verification&q='+encodeURIComponent(tag));assert.ok(html.includes('1 წერილი'),'kind filter');
  html=await page('/admin/system');assert.ok(html.includes('ელფოსტის ჟურნალი'));
  // Anyone else: no access.
  assert.equal((await fetch(base+'/admin/emails',{redirect:'manual'})).status,404);
  console.log(JSON.stringify({ok:true}));
 }finally{
  await db.query('DELETE FROM "EmailLog" WHERE recipient=$1',[email]).catch(()=>{});
  await db.query('DELETE FROM "SecurityRateBucket" WHERE "key"=ANY($1)',[[bucket('email-cooldown',email),bucket('email-recipient-hour',email)]]).catch(()=>{});
  await db.query('DELETE FROM "PasswordResetRequest" WHERE "userId"=$1',[userId]).catch(()=>{});
  await db.query('DELETE FROM "User" WHERE id=$1',[userId]).catch(()=>{});
  for(const cleanup of cleanups)await cleanup();
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
