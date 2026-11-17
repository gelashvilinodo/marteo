/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of admin invites (multi-admin). */
// Needs a `DEV_DELIVERY=console next dev` server. The real owner's 2FA secret is unknown, so the invite
// e-mail and admin removal are checked up to the code step; the accept path uses an invite row made here.
require('dotenv').config({quiet:true});
const {createQaAdmin}=require('./qa-admin.cjs');
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const inviteHash=token=>createHash('sha256').update('marteo-admin-invite:'+token).digest('hex');
const sha=v=>createHash('sha256').update(v).digest('hex');

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='team-qa-'+randomUUID().slice(0,8),cleanups=[];
 const U=tag+'-u',emailU=`${tag}-u@example.invalid`,O=tag+'-o',emailO=`${tag}-o@example.invalid`;
 const passwordU='QaPass-'+randomBytes(4).toString('hex');
 try{
  await db.connect();
  const owner=await createQaAdmin(db,tag);cleanups.push(()=>owner.cleanup());
  const bcrypt=require('bcryptjs');
  // Wrong-code checks count against the real owner's 2FA limit; give it back afterwards.
  cleanups.push(()=>db.query('DELETE FROM "SecurityRateBucket" WHERE "key" = ANY($1)',[[ 'admin-2fa-user:'+sha(owner.id),'admin-2fa-ip:'+sha('unavailable') ]]));
  cleanups.push(()=>db.query('DELETE FROM "AdminAuditLog" WHERE "targetId" LIKE $1 OR "adminId" LIKE $1',[tag+'%']));
  cleanups.push(()=>db.query('DELETE FROM "AdminInvite" WHERE email LIKE $1',[tag+'%']));
  cleanups.push(()=>db.query('DELETE FROM "User" WHERE id=ANY($1::text[])',[[U,O]]));
  for(const [id,email] of [[U,emailU],[O,emailO]])
   await db.query('INSERT INTO "User" (id,email,phone,password,status,"firstName","lastName","emailVerifiedAt","phoneVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',\'QA\',\'Admin\',now(),now(),now())',[id,email,'+000'+id,await bcrypt.hash(passwordU,4)]);

  const req=(p,cookie,body,method)=>fetch(base+p,{method:method||(body!==undefined?'POST':'GET'),redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const json=async r=>({status:r.status,...(await r.json().catch(()=>({})))});

  // 1. Owner: dropdown with the invite button, /admin/admins lists the owner.
  let html=(await (await req('/admin',owner.cookie)).text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('ანგარიშის მენიუ'),'profile dropdown rendered');
  assert.ok(html.includes('ადმინის დამატება'),'owner sees invite item');
  let r=await req('/admin/admins',owner.cookie);assert.equal(r.status,200);html=(await r.text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('მფლობელი')&&html.includes('ადმინის დამატება'),'team page for owner');

  // 2. Create invite: validation, wrong code, no access for others.
  let d=await json(await req('/api/admin/team/invites',owner.cookie,{email:'nope',code:'123456'}));assert.equal(d.status,422,d.message);
  d=await json(await req('/api/admin/team/invites',owner.cookie,{email:emailU}));assert.equal(d.status,422,'code required: '+d.message);
  d=await json(await req('/api/admin/team/invites',owner.cookie,{email:emailU,code:'000000'}));assert.equal(d.status,403,'wrong code: '+d.message);
  assert.equal((await db.query('SELECT count(*)::int n FROM "AdminInvite" WHERE email=$1',[emailU])).rows[0].n,0,'nothing created on a wrong code');
  const sessionO=randomBytes(32).toString('hex');
  await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,now()+interval \'1 day\',now())',[tag+'-so',O,sha(sessionO)]);
  d=await json(await req('/api/admin/team/invites','marteo_session='+sessionO,{email:emailU,code:'000000'}));assert.equal(d.status,403,'plain user cannot invite');
  r=await fetch(base+'/api/admin/team/invites',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});
  assert.equal(r.status,403,'cross-origin blocked');

  // 3. Invite made directly (real e-mail step needs the owner's code). Lookup + accept.
  const token=randomBytes(32).toString('hex'),inviteId=tag+'-inv';
  await db.query('INSERT INTO "AdminInvite" (id,email,"tokenHash","expiresAt","invitedById") VALUES ($1,$2,$3,now()+interval \'2 days\',$4)',[inviteId,emailU,inviteHash(token),owner.id]);
  html=(await (await req('/admin/admins',owner.cookie)).text()).replaceAll('<!-- -->','');assert.ok(html.includes(emailU),'pending invite listed');
  d=await json(await req('/api/admin-invite/lookup',null,{token:'x'.repeat(64)}));assert.equal(d.status,404);
  d=await json(await req('/api/admin-invite/lookup',null,{token}));assert.equal(d.status,200);assert.equal(d.email,emailU);assert.equal(d.accountExists,true);
  r=await req('/admin-invite',null);assert.equal(r.status,200,'accept page renders');
  d=await json(await req('/api/admin-invite/accept','marteo_session='+sessionO,{token,mode:'signed-in'}));assert.equal(d.status,403,'signed in as another account: '+d.message);
  d=await json(await req('/api/admin-invite/accept',null,{token,mode:'password',password:'wrong-password'}));assert.equal(d.status,401,d.message);
  r=await req('/api/admin-invite/accept',null,{token,mode:'password',password:passwordU});d={status:r.status,...await r.json()};
  assert.equal(d.status,200,d.message);assert.equal(d.redirectTo,'/admin-login');
  const cookieU=(r.headers.get('set-cookie')||'').match(/marteo_session=([a-f0-9]{64})/)?.[1];assert.ok(cookieU,'session cookie set');
  cleanups.unshift(()=>db.query('DELETE FROM "Session" WHERE "userId"=$1',[U]));
  const rowU=(await db.query('SELECT "isPlatformAdmin" FROM "User" WHERE id=$1',[U])).rows[0];assert.equal(rowU.isPlatformAdmin,true,'now admin');
  const inv=(await db.query('SELECT status,"acceptedById" FROM "AdminInvite" WHERE id=$1',[inviteId])).rows[0];assert.deepEqual(inv,{status:'ACCEPTED',acceptedById:U});
  d=await json(await req('/api/admin-invite/accept',null,{token,mode:'password',password:passwordU}));assert.equal(d.status,404,'one-time link');

  // 4. New admin: /admin-login asks for 2FA setup, /admin is not open yet.
  r=await req('/admin-login','marteo_session='+cookieU);assert.equal(r.status,200,'2FA setup page');
  r=await req('/admin','marteo_session='+cookieU);assert.ok([307,308].includes(r.status)?/admin-login/.test(r.headers.get('location')||''):(await r.text()).includes('/admin-login'),'redirect to /admin-login before 2FA');

  // Give U 2FA + a trusted device to check the invited admin's view.
  await db.query('INSERT INTO "AdminSecurity" ("userId","totpSecret","totpEnabledAt","updatedAt") VALUES ($1,\'JBSWY3DPEHPK3PXP\',now(),now())',[U]);
  const deviceU=randomBytes(32).toString('hex');
  await db.query('INSERT INTO "AdminTrustedDevice" (id,"userId","tokenHash",label,"expiresAt") VALUES ($1,$2,$3,\'QA\',now()+interval \'1 day\')',[tag+'-du',U,sha('marteo-admin-device:'+deviceU)]);
  const adminU=`marteo_session=${cookieU}; marteo_admin_device=${deviceU}`;
  html=(await (await req('/admin',adminU)).text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('ანგარიშის მენიუ'),'invited admin sees the panel');
  assert.ok(!html.includes('ადმინის დამატება'),'invited admin has no invite item');
  html=(await (await req('/admin/admins',adminU)).text()).replaceAll('<!-- -->','');
  assert.ok(html.includes('მხოლოდ პლატფორმის მფლობელს'),'not-owner text');
  d=await json(await req('/api/admin/team/invites',adminU,{email:emailO,code:'000000'}));assert.equal(d.status,403);assert.match(d.message,/მფლობელს/);
  d=await json(await req(`/api/admin/team/members/${owner.id}/remove`,adminU,{code:'000000'}));assert.equal(d.status,403,'invited admin cannot remove the owner');
  // Owner: can't remove self, wrong code blocks removing U.
  d=await json(await req(`/api/admin/team/members/${owner.id}/remove`,owner.cookie,{code:'000000'}));assert.equal(d.status,422,d.message);
  d=await json(await req(`/api/admin/team/members/${U}/remove`,owner.cookie,{code:'000000'}));assert.equal(d.status,403,d.message);
  assert.equal((await db.query('SELECT "isPlatformAdmin" FROM "User" WHERE id=$1',[U])).rows[0].isPlatformAdmin,true,'still admin after wrong code');

  // 5. Cancel a pending invite (owner only, no code).
  const cancelId=tag+'-inv2';
  await db.query('INSERT INTO "AdminInvite" (id,email,"tokenHash","expiresAt","invitedById") VALUES ($1,$2,$3,now()+interval \'2 days\',$4)',[cancelId,emailO,inviteHash(randomBytes(32).toString('hex')),owner.id]);
  d=await json(await req(`/api/admin/team/invites/${cancelId}/cancel`,adminU,undefined,'POST'));assert.equal(d.status,403,'invited admin cannot cancel');
  r=await fetch(base+`/api/admin/team/invites/${cancelId}/cancel`,{method:'POST',headers:{Cookie:owner.cookie,Origin:base}});d={status:r.status,...await r.json()};
  assert.equal(d.status,200,d.message);
  assert.equal((await db.query('SELECT status FROM "AdminInvite" WHERE id=$1',[cancelId])).rows[0].status,'CANCELED');

  // Clean the invited admin before the user delete (removal path itself needs the owner's code).
  cleanups.unshift(()=>db.query('UPDATE "User" SET "isPlatformAdmin"=false WHERE id=$1',[U]));
  console.log('ADMIN TEAM QA PASS');
 }catch(error){console.error(error);process.exitCode=1}
 finally{for(const c of cleanups)await Promise.resolve().then(c).catch(e=>console.error('cleanup',e.message));await db.end()}
})();
