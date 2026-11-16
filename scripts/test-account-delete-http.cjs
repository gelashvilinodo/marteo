/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of self-service account deletion. */
// Run the server with DEV_DELIVERY=console so the goodbye e-mail is only printed, never sent.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict'),bcrypt=require('bcryptjs');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const emailHash=e=>createHash('sha256').update('marteo-deleted-email:'+e.trim().toLowerCase()).digest('hex');
const phoneHash=p=>createHash('sha256').update('marteo-deleted-phone:'+p).digest('hex');

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='selfdel-qa-'+randomUUID().slice(0,8),password='QA-'+randomBytes(6).toString('hex');
 const A=tag+'-a',B=tag+'-b',again=tag+'-again',email=`${tag}@example.invalid`,phone='+99559'+String(Date.now()).slice(-7);
 const biz1=tag+'-solo',biz2=tag+'-shared',created=[];
 try{
  await db.connect();
  const hash=await bcrypt.hash(password,10);
  const user=(id,mail,ph,trial)=>db.query('INSERT INTO "User" (id,email,phone,password,status,"firstName","emailVerifiedAt","phoneVerifiedAt","trialUsedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',\'QA\',now(),now(),$5,now())',[id,mail,ph,hash,trial?new Date().toISOString():null]);
  await user(A,email,phone,true);await user(B,`${tag}-b@example.invalid`,'+0001'+tag,false);
  await db.query('INSERT INTO "Business" (id,name,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())',[biz1,'QA solo '+tag,biz2,'QA shared '+tag]);
  const member=(u,b,role)=>db.query('INSERT INTO "BusinessMembership" (id,"userId","businessId",role,"updatedAt") VALUES ($1,$2,$3,$4::"MembershipRole",now())',[u+b,u,b,role]);
  await member(A,biz1,'OWNER');await member(A,biz2,'OWNER');await member(B,biz2,'OWNER');
  const session=async id=>{const t=randomBytes(32).toString('hex');await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),id,createHash('sha256').update(t).digest('hex'),new Date(Date.now()+86400000).toISOString()]);return t};
  const token=await session(A);
  const call=(p,t,body)=>fetch(base+p,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:'marteo_session='+t,...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});

  // Profile page shows the section; the plan lists each business's fate.
  let html=(await (await call('/dashboard/profile',token)).text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('ანგარიშის წაშლა'),'profile section');
  let d=await (await call('/api/profile/delete',token)).json();assert.equal(d.success,true);
  const fates=Object.fromEntries(d.businesses.map(b=>[b.id,b.fate]));assert.deepEqual(fates,{[biz1]:'delete',[biz2]:'leave'});
  assert.equal((await call('/api/profile/delete','forged',{password})).status,401,'needs a session');
  assert.equal((await call('/api/profile/delete',token,{password:'wrong'})).status,401,'wrong password');
  assert.equal((await fetch(base+'/api/profile/delete',{method:'POST',headers:{Cookie:'marteo_session='+token,'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403,'origin guard');

  const r=await call('/api/profile/delete',token,{password});d=await r.json();assert.equal(r.status,200,d.message);
  const cookies=(r.headers.getSetCookie?.()??[]).join(';');assert.match(cookies,/marteo_session=;/,'session cookie cleared');
  const one=async(sql,p)=>(await db.query(sql,p)).rows[0].n;
  assert.equal(await one('SELECT count(*)::int n FROM "User" WHERE id=$1',[A]),0,'user gone');
  assert.equal(await one('SELECT count(*)::int n FROM "Business" WHERE id=$1',[biz1]),0,'sole-owned business gone');
  assert.equal(await one('SELECT count(*)::int n FROM "Business" WHERE id=$1',[biz2]),1,'shared business stays');
  assert.equal(await one('SELECT count(*)::int n FROM "DeletedAccount" WHERE "emailHash"=$1 AND "phoneHash"=$2',[emailHash(email),phoneHash(phone)]),1,'trial hashes kept');
  assert.equal(await one('SELECT count(*)::int n FROM "DeletedAccount" WHERE "emailHash"=$1',[email]),0,'never the plain address');
  assert.equal(await one('SELECT count(*)::int n FROM "Session" WHERE "userId"=$1',[A]),0,'sessions gone');
  assert.equal((await call('/api/profile/delete',token)).status,401,'old session no longer works');
  html=(await (await fetch(base+'/?account=deleted')).text());assert.ok(html.includes('<!DOCTYPE html>')||html.includes('<html'),'home renders');

  // Registering again with the same e-mail: the first business gets no trial.
  await user(again,email,'+0002'+tag,false);created.push(again);
  const t2=await session(again);
  d=await (await call('/api/business/onboarding',t2,{name:'QA again '+tag,category:'QA',mode:'IMPORT'})).json();
  if(d.error&&/მიმართულება/.test(d.error))throw Error('Adjust mode value: '+d.error);
  assert.equal(d.subscriptionStatus,'ACTIVE',JSON.stringify(d));assert.equal(d.plan,'FREE','no second trial');
  console.log(JSON.stringify({ok:true}));
 }finally{
  await db.query('DELETE FROM "DeletedAccount" WHERE "emailHash"=$1',[emailHash(email)]).catch(()=>{});
  await db.query('DELETE FROM "Notification" WHERE "userId"=ANY($1)',[[A,B,again]]).catch(()=>{});
  await db.query('DELETE FROM "Business" WHERE id=ANY($1) OR name LIKE $2',[[biz1,biz2],'QA again '+tag]).catch(()=>{});
  await db.query('DELETE FROM "User" WHERE id=ANY($1)',[[A,B,again]]).catch(()=>{});
  await db.query('DELETE FROM "SecurityRateBucket" WHERE "key" LIKE \'account-delete:%\'').catch(()=>{});
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
