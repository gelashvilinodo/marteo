/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA with temporary sessions. */
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const fixture='admin-qa-'+randomUUID(),sessionIds=[];
 try{
  await db.connect();
  const owner=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
  assert.equal(owner.length,1);
  await db.query('INSERT INTO "User" (id,email,phone,password,status,"updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',now())',[fixture,fixture+'@example.invalid',fixture,'disabled-qa-password']);
  async function session(userId,expired=false){const token=randomBytes(32).toString('hex'),id=randomUUID();sessionIds.push(id);await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[id,userId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+(expired?-60000:600000))]);return token}
  const ownerToken=await session(owner[0].id),userToken=await session(fixture),expiredToken=await session(owner[0].id,true);
  async function get(path,token){return fetch(base+path,{headers:token?{Cookie:'marteo_session='+token}:{},redirect:'manual'})}
  for(const token of [undefined,'forged',userToken,expiredToken]){
   const api=await get('/api/admin/overview',token);assert.equal(api.status,403);assert.equal(api.headers.get('cache-control'),'private, no-store');
   const page=await get('/admin',token);assert.equal(page.status,404);assert.ok(!(await page.text()).includes('მთელი პლატფორმის მონაცემები'));
  }
  let r=await get('/api/admin/overview',ownerToken);assert.equal(r.status,200);const data=await r.json();assert.ok(Number.isInteger(data.users));
  const businessCount=(await db.query('SELECT count(*)::int AS count FROM "Business"')).rows[0].count;
  assert.equal(data.totalBusinesses,businessCount);
  const start=new Date(data.date+'T00:00:00+04:00'),end=new Date(start.getTime()+86400000);
  const expected=(await db.query('SELECT count(*)::int AS count FROM "Order" WHERE "deletedAt" IS NULL')).rows[0].count;
  assert.equal(data.orders,expected);
  const newBusinesses=(await db.query('SELECT count(*)::int AS count FROM "Business" WHERE "createdAt">=$1 AND "createdAt"<$2',[start,end])).rows[0].count;
  assert.equal(data.newBusinessesToday,newBusinesses);
  r=await get('/admin',ownerToken);assert.equal(r.status,200);const html=await r.text();
  for(const label of ['ბიზნესები სულ','მომხმარებლები სულ','შეკვეთები სულ','დაბეჭდილი ინვოისები სულ','მარაგის მოძრაობები სულ','დღეს დამატებული ბიზნესები'])assert.ok(html.includes(label));
  r=await get('/dashboard',ownerToken);assert.equal(r.status,200);assert.ok((await r.text()).includes('ადმინ პანელი'));
  await db.query('UPDATE "User" SET "isPlatformAdmin"=false WHERE id=$1',[fixture]);
  // Suspension must invalidate an otherwise valid session too.
  await db.query('UPDATE "User" SET status=\'SUSPENDED\' WHERE id=$1',[fixture]);
  assert.equal((await get('/api/admin/overview',userToken)).status,403);
  console.log('PASS: real HTTP owner page/menu/API, DB count parity; anonymous, forged, ordinary, expired, suspended denied; temporary sessions cleaned.');
 }finally{
  if(sessionIds.length)await db.query('DELETE FROM "Session" WHERE id=ANY($1::text[])',[sessionIds]);
  await db.query('DELETE FROM "User" WHERE id=$1',[fixture]);await db.end();
 }
})().catch(()=>{console.error('Admin HTTP QA failed');process.exitCode=1});
