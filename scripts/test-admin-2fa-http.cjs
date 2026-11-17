/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of admin 2FA. */
// Only one platform admin can exist, so this runs on the real admin account, but only while that admin has NOT
// set up 2FA yet: it adds its own 2FA rows, devices and session and removes them all at the end.
// The password is never read or changed: the password-protected steps are checked for refusal only.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash,createHmac}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32decode=s=>{let bits=0,v=0;const out=[];for(const c of s.replace(/\s/g,'')){v=(v<<5)|B32.indexOf(c);bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(out)};
const totp=(secret,offset=0)=>{const step=Math.floor(Date.now()/30000)+offset,c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',b32decode(secret)).update(c).digest(),o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0')};
// The server refuses a code whose 30-second step was already used, so wait for the next step when needed.
const nextStep=()=>new Promise(r=>setTimeout(r,30000-(Date.now()%30000)+300));

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const sessionIds=[];let adminId=null;
 try{
  await db.connect();
  const admins=(await db.query('SELECT id FROM "User" u WHERE "isPlatformAdmin" AND status=\'ACTIVE\' AND NOT EXISTS (SELECT 1 FROM "AdminInvite" i WHERE i."acceptedById"=u.id AND i.status=\'ACCEPTED\')')).rows;
  assert.equal(admins.length,1);
  const existing=(await db.query('SELECT (SELECT count(*)::int FROM "AdminSecurity" WHERE "userId"=$1) AS security,(SELECT count(*)::int FROM "AdminTrustedDevice" WHERE "userId"=$1) AS devices,(SELECT count(*)::int FROM "AdminAuditLog" WHERE "targetId"=$1 AND action LIKE \'admin-%\') AS audit',[admins[0].id])).rows[0];
  if(existing.security||existing.devices||existing.audit){console.log(JSON.stringify({skipped:'real admin already uses 2FA; this QA only runs before setup'}));return}
  adminId=admins[0].id;
  const token=randomBytes(32).toString('hex'),sid=randomUUID();sessionIds.push(sid);
  await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[sid,adminId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000).toISOString()]);
  // Each "browser" is the session cookie plus its own admin-device cookie.
  const browser=()=>{const jar={marteo_session:token};return{
   jar,
   async call(p,body,method){const r=await fetch(base+p,{method:method??(body!==undefined?'POST':'GET'),redirect:'manual',headers:{Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...(body!==undefined?{'Content-Type':'application/json',Origin:base,'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'}:{})},body:body!==undefined?JSON.stringify(body):undefined});
    for(const c of r.headers.getSetCookie?.()??[]){const [pair]=c.split(';');const [k,...v]=pair.split('=');jar[k]=v.join('=');if(/Max-Age=0/i.test(c))delete jar[k]}
    return r},
  }};
  // Only this test admin's bucket and the local "unavailable" IP bucket.
  const resetLimits=()=>db.query('DELETE FROM "SecurityRateBucket" WHERE "key" = ANY($1)',[[ 'admin-2fa-user:'+createHash('sha256').update(adminId).digest('hex'),'admin-2fa-ip:'+createHash('sha256').update('unavailable').digest('hex') ]]);
  const json=async r=>({status:r.status,...(await r.json().catch(()=>({})))});
  const a=browser();

  // Before the second step: admin pages redirect to /admin-login, admin APIs refuse, login page shows setup.
  let r=await a.call('/admin');assert.ok([307,308].includes(r.status)||r.status===200,'admin before 2FA: '+r.status);
  if(r.status===200){const html=await r.text();assert.ok(/admin-login/.test(html),'streamed redirect to /admin-login')}else assert.match(r.headers.get('location'),/\/admin-login/);
  assert.equal((await a.call('/api/admin/support/unread')).status,403,'API needs the second step');
  let html=(await (await a.call('/admin-login')).text()).replaceAll('<!-- -->','');assert.ok(html.includes('ორეტაპიანი შესვლის ჩართვა'),'setup screen');
  assert.equal((await a.call('/api/admin/2fa/devices',{deviceId:'others'})).status,403,'trusted-only route');

  // Setup: wrong password, then a QR, then a wrong code, then the real one.
  assert.equal((await a.call('/api/admin/2fa/setup',{password:'wrong'})).status,403);
  // The correct-password step is simulated in the DB (QA never knows the real password).
  const secret=B32.split('').sort(()=>Math.random()-.5).join('').slice(0,32);
  await db.query('INSERT INTO "AdminSecurity" ("userId","pendingSecret","updatedAt") VALUES ($1,$2,now())',[adminId,secret]);
  let d;
  assert.equal((await a.call('/api/admin/2fa/enable',{code:'000000'})).status,403);
  const firstCode=totp(secret);
  d=await json(await a.call('/api/admin/2fa/enable',{code:firstCode,remember:true}));assert.equal(d.status,200,d.message);
  assert.equal(d.backupCodes.length,10);const backup=d.backupCodes;
  assert.ok(a.jar.marteo_admin_device,'device cookie set');
  assert.equal((await a.call('/api/admin/2fa/setup',{password:'wrong'})).status,403,'setup still wants the password');
  assert.equal((await a.call('/admin/security')).status,200);
  html=(await (await a.call('/admin/security')).text()).replaceAll('<!-- -->','');
  for(const t of ['სანდო მოწყობილობები','ეს მოწყობილობა','Safari · iPhone','დარჩა 10 ერთჯერადი კოდი','ორეტაპიანი შესვლა ჩაირთო'])assert.ok(html.includes(t),'security page: '+t);
  assert.equal((await a.call('/api/admin/support/unread')).status,200,'API works on trusted device');
  html=(await (await a.call('/admin-login')).status);assert.ok([307,308,200].includes(html));

  // A second browser needs a code; the same app code cannot be used twice; a backup code works once.
  const b=browser();
  assert.equal((await b.call('/api/admin/support/unread')).status,403);
  html=(await (await b.call('/admin-login')).text()).replaceAll('<!-- -->','');assert.ok(html.includes('შეიყვანეთ კოდი'),'verify screen');
  assert.equal((await b.call('/api/admin/2fa/verify',{code:firstCode})).status,403,'a used code is refused');
  assert.equal((await b.call('/api/admin/2fa/verify',{code:'abcde-fghij'})).status,403,'unknown backup code');
  d=await json(await b.call('/api/admin/2fa/verify',{code:backup[0].toUpperCase(),remember:false}));assert.equal(d.status,200,d.message);assert.equal(d.backupLeft,9);
  assert.ok(b.jar.marteo_admin_device);assert.equal((await b.call('/api/admin/support/unread')).status,200);
  const c=browser();
  assert.equal((await c.call('/api/admin/2fa/verify',{code:backup[0]})).status,403,'backup code is single use');

  await resetLimits();
  // Dangerous actions want a fresh code even on a trusted device.
  r=await a.call('/api/admin/businesses/none-qa/bank/none-qa/refund',{reason:'x'});assert.equal(r.status,422,'refund without code');
  r=await a.call('/api/admin/businesses/none-qa',{confirmName:'x'},'DELETE');assert.equal(r.status,422,'delete without code');
  await nextStep();
  r=await a.call('/api/admin/businesses/none-qa',{confirmName:'x',code:totp(secret)},'DELETE');assert.notEqual(r.status,403,'valid code passes the code check');

  // Devices: revoke the other browser; it falls back to the code screen.
  d=await json(await a.call('/api/admin/2fa/devices',{deviceId:'others'}));assert.equal(d.status,200,d.message);assert.equal(d.devices.length,1);
  assert.equal((await b.call('/api/admin/support/unread')).status,403,'revoked device');
  // Backup codes: regenerate with a code; old ones stop working.
  await nextStep();
  d=await json(await a.call('/api/admin/2fa/backup-codes',{code:totp(secret)}));assert.equal(d.status,200,d.message);assert.equal(d.backupCodes.length,10);
  assert.equal((await c.call('/api/admin/2fa/verify',{code:backup[1]})).status,403,'old backup codes revoked');
  await resetLimits();
  // Rate limit: repeated wrong codes are cut off.
  let limited=false;for(let i=0;i<12&&!limited;i++)limited=(await c.call('/api/admin/2fa/verify',{code:'111111'})).status===429;
  assert.ok(limited,'wrong codes are rate limited');
  await resetLimits();

  // Reset (new phone) wants the password: a wrong one changes nothing.
  await nextStep();
  assert.equal((await a.call('/api/admin/2fa/reset',{password:'wrong',code:totp(secret)})).status,403);
  assert.equal((await a.call('/api/admin/support/unread')).status,200,'still trusted after a refused reset');
  // Leaving this device: cookie cleared, code screen again.
  d=await json(await a.call('/api/admin/2fa/forget',{}));assert.equal(d.status,200,d.message);
  assert.ok(!a.jar.marteo_admin_device,'device cookie cleared');
  html=(await (await a.call('/admin-login')).text()).replaceAll('<!-- -->','');assert.ok(html.includes('შეიყვანეთ კოდი'),'code screen after leaving');
  const audit=(await db.query('SELECT action FROM "AdminAuditLog" WHERE "targetId"=$1 ORDER BY "createdAt"',[adminId])).rows.map(x=>x.action);
  for(const action of ['admin-2fa-enable','admin-device-trust','admin-backup-used','admin-device-revoke','admin-backup-regenerate'])assert.ok(audit.includes(action),'audit '+action);
  console.log(JSON.stringify({ok:true}));
 }finally{
  await db.query('DELETE FROM "Session" WHERE id = ANY($1)',[sessionIds]).catch(()=>{});
  if(adminId){
   await db.query('DELETE FROM "AdminAuditLog" WHERE "targetId"=$1 AND action LIKE \'admin-%\'',[adminId]).catch(()=>{});
   await db.query('DELETE FROM "AdminTrustedDevice" WHERE "userId"=$1',[adminId]).catch(()=>{});
   await db.query('DELETE FROM "AdminSecurity" WHERE "userId"=$1',[adminId]).catch(()=>{});
  }
  if(adminId)await db.query('DELETE FROM "SecurityRateBucket" WHERE "key" = ANY($1)',[[ 'admin-2fa-user:'+createHash('sha256').update(adminId).digest('hex'),'admin-2fa-ip:'+createHash('sha256').update('unavailable').digest('hex') ]]).catch(()=>{});
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
