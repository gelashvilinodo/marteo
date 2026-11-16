/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of admin account deletion. */
require('dotenv').config({quiet:true});
const {createQaAdmin}=require('./qa-admin.cjs');
const {Client}=require('pg'),{randomUUID,randomBytes,createHash,createHmac}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32decode=s=>{let bits=0,v=0;const out=[];for(const c of s){v=(v<<5)|B32.indexOf(c);bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(out)};
const totp=secret=>{const step=Math.floor(Date.now()/30000),c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',b32decode(secret)).update(c).digest(),o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0')};

// Target A: sole owner of biz1 (staff C inside), co-owner of biz2 (with B, staff C), staff of biz3 (owner B).
(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='del-qa-'+randomUUID().slice(0,8),cleanups=[];
 const A=tag+'-a',B=tag+'-b',C=tag+'-c',biz1=tag+'-biz1',biz2=tag+'-biz2',biz3=tag+'-biz3',emailA=`${tag}-a@example.invalid`;
 try{
  await db.connect();
  const qaAdmin=await createQaAdmin(db,tag);cleanups.push(()=>qaAdmin.cleanup());
  for(const [id,email] of [[A,emailA],[B,`${tag}-b@example.invalid`],[C,`${tag}-c@example.invalid`]])
   await db.query('INSERT INTO "User" (id,email,phone,password,status,"firstName","emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,\'qa\',\'ACTIVE\',\'QA\',now(),now(),now())',[id,email,'+000'+id]);
  for(const [id,name] of [[biz1,'QA solo '+tag],[biz2,'QA shared '+tag],[biz3,'QA staff '+tag]])
   await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now())',[id,name]);
  const member=(user,business,role)=>db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,$4::"MembershipRole",now())',[user+business,user,business,role]);
  await member(A,biz1,'OWNER');await member(C,biz1,'MEMBER');
  await member(A,biz2,'OWNER');await member(B,biz2,'OWNER');await member(C,biz2,'MEMBER');
  await member(B,biz3,'OWNER');await member(A,biz3,'MEMBER');
  await db.query('INSERT INTO "EmailLog" (id,kind,recipient,status) VALUES ($1,\'verification\',$2,\'SENT\')',[tag+'-mail',emailA]);
  await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,now()+interval \'1 day\',now())',[tag+'-sa',A,createHash('sha256').update(randomBytes(8)).digest('hex')]);

  const call=(p,body)=>fetch(base+p,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:qaAdmin.cookie,...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});
  let html=(await (await call(`/admin/users/${A}`)).text()).replaceAll('<!-- -->','');
  for(const t of ['ანგარიშის წაშლა',`QA solo ${tag}`,'წაიშლება ყველა მონაცემით','(1 წევრი შეტყობინებას მიიღებს)','თანამფლობელობიდან გავა, ბიზნესი დარჩება','გუნდიდან გავა, ბიზნესი დარჩება','1 ბიზნესი წაიშლება'])assert.ok(html.includes(t),'dialog: '+t);
  html=(await (await call(`/admin/users/${qaAdmin.id}`)).text());assert.ok(!html.includes('ანგარიშის წაშლა'),'no delete button for the admin');

  const del=(id,body)=>call(`/api/admin/users/${id}/delete`,body);
  assert.equal((await del(A,{confirmEmail:'wrong@example.invalid',code:'123456'})).status,422,'email must match');
  assert.equal((await del(A,{confirmEmail:emailA})).status,422,'code required');
  assert.equal((await del(A,{confirmEmail:emailA,code:'000000'})).status,403,'wrong code');
  assert.equal((await del(qaAdmin.id,{confirmEmail:'x',code:'000000'})).status,403,'admin account protected');
  assert.equal((await db.query('SELECT count(*)::int n FROM "User" WHERE id=$1',[A])).rows[0].n,1,'nothing deleted yet');
  if(!qaAdmin.secret){console.log(JSON.stringify({ok:true,deletion:'skipped: real admin uses 2FA, QA cannot make a code'}));return}

  await db.query('UPDATE "AdminSecurity" SET "lastTotpStep"=0 WHERE "userId"=$1',[qaAdmin.id]);
  const r=await del(A,{confirmEmail:emailA.toUpperCase(),code:totp(qaAdmin.secret)});const d=await r.json();
  assert.equal(r.status,200,d.message);assert.match(d.message,/წაიშალა 1 ბიზნესიც/);
  const one=async(sql,params)=>(await db.query(sql,params)).rows[0].n;
  assert.equal(await one('SELECT count(*)::int n FROM "User" WHERE id=$1',[A]),0,'user gone');
  assert.equal(await one('SELECT count(*)::int n FROM "Session" WHERE "userId"=$1',[A]),0,'sessions gone');
  assert.equal(await one('SELECT count(*)::int n FROM "Business" WHERE id=$1',[biz1]),0,'sole-owned business deleted');
  assert.equal(await one('SELECT count(*)::int n FROM "Business" WHERE id=ANY($1)',[[biz2,biz3]]),2,'other businesses stay');
  assert.equal(await one('SELECT count(*)::int n FROM "BusinessMembership" WHERE "businessId"=$1 AND role=\'OWNER\'',[biz2]),1,'co-owner B remains');
  assert.equal(await one('SELECT count(*)::int n FROM "BusinessMembership" WHERE "userId"=$1',[C]),1,'staff C only in biz2 now');
  assert.equal(await one('SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND title=\'ბიზნესი წაიშალა\'',[C]),1,'staff told about deletion');
  assert.ok(await one('SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND title=\'წევრმა ბიზნესი დატოვა\'',[B])>=1,'co-owner told');
  assert.equal(await one('SELECT count(*)::int n FROM "EmailLog" WHERE recipient=$1',[emailA]),0,'e-mail log erased');
  const audit=(await db.query('SELECT after FROM "AdminAuditLog" WHERE action=\'user-delete\' AND "targetId"=$1',[A])).rows[0];
  assert.ok(audit,'audited');assert.ok(!JSON.stringify(audit.after).includes(emailA),'no e-mail in history');
  assert.equal((await call(`/admin/users/${A}`)).status,404);
  console.log(JSON.stringify({ok:true,deletion:'done'}));
 }finally{
  await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=$1',[A]).catch(()=>{});
  await db.query('DELETE FROM "Notification" WHERE "userId"=ANY($1)',[[A,B,C]]).catch(()=>{});
  await db.query('DELETE FROM "EmailLog" WHERE recipient=$1',[emailA]).catch(()=>{});
  await db.query('DELETE FROM "Business" WHERE id=ANY($1)',[[biz1,biz2,biz3]]).catch(()=>{});
  await db.query('DELETE FROM "User" WHERE id=ANY($1)',[[A,B,C]]).catch(()=>{});
  for(const cleanup of cleanups)await cleanup();
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
