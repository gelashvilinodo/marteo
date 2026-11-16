/* eslint-disable @typescript-eslint/no-require-imports -- Local integration QA of the hourly admin alerts job. */
// Needs the server started with CRON_SECRET (the same value in this shell). Without ADMIN_PUSH_LOCAL=1
// nothing reaches the phone: the route still answers with what it would have sent.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ADMIN_QA_BASE_URL||'http://localhost:3100';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local QA only');
const secret=process.env.CRON_SECRET;
if(!secret||secret.length<16)throw Error('Set CRON_SECRET (16+ chars) for both the server and this script');
require('pg').types.setTypeParser(1114,value=>new Date(value.replace(' ','T')+'Z'));
const ago=ms=>new Date(Date.now()-ms).toISOString();

(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 const tag='alerts-qa-'+randomUUID().slice(0,8),job=tag+'-job';
 let savedAlertsJob=null;
 try{
  await db.connect();
  savedAlertsJob=(await db.query('SELECT * FROM "SystemJob" WHERE name=\'admin-alerts\'')).rows[0]??null;
  // The previous alerts run "finished" 10 minutes ago: only newer items count.
  await db.query('INSERT INTO "SystemJob" (name,"lastFinishedAt",runs) VALUES (\'admin-alerts\',$1,1) ON CONFLICT (name) DO UPDATE SET "lastFinishedAt"=$1',[ago(10*60000)]);
  await db.query('INSERT INTO "SystemError" (id,fingerprint,source,message,"firstAt","lastAt") VALUES ($1,$2,\'server\',$3,$4,$4)',[tag+'-new',tag+'-fp-new',`QA new error ${tag}`,ago(60000)]);
  await db.query('INSERT INTO "SystemError" (id,fingerprint,source,message,"firstAt","lastAt") VALUES ($1,$2,\'server\',$3,$4,$5)',[tag+'-old',tag+'-fp-old',`QA old error ${tag}`,ago(3*3600000),ago(60000)]);
  await db.query('INSERT INTO "SystemJob" (name,"lastFinishedAt","lastOk","lastError",runs,failures) VALUES ($1,$2,false,\'TypeError\',1,1)',[job,ago(60000)]);
  await db.query('INSERT INTO "SystemJob" (name,"lastFinishedAt","lastOk","lastError",runs,failures) VALUES ($1,$2,false,\'TypeError\',1,1)',[job+'-old',ago(2*3600000)]);
  // Stuck: crossed the 30-minute line after the previous run. Not yet stuck / long known: not counted.
  const bank=(id,ms)=>db.query('INSERT INTO "BankPayment" (id,kind,status,plan,amount,"createdAt") VALUES ($1,\'CHECKOUT\',\'PENDING\',\'START\',19,$2)',[id,ago(ms)]);
  await bank(tag+'-stuck',35*60000);await bank(tag+'-fresh',5*60000);await bank(tag+'-known',5*3600000);

  const call=auth=>fetch(base+'/api/cron/admin-alerts',{method:'POST',headers:auth?{authorization:'Bearer '+auth}:{}});
  assert.equal((await call()).status,401);
  assert.equal((await call('x'.repeat(secret.length))).status,401);
  let r=await call(secret);let d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
  const mine=d.summary.newErrors.filter(e=>e.message.includes(tag)).map(e=>e.message);
  assert.deepEqual(mine,[`QA new error ${tag}`],'only the new error type');
  assert.ok(d.summary.failedJobs.includes(job),'failed job');assert.ok(!d.summary.failedJobs.includes(job+'-old'),'old failure already reported');
  assert.ok(!d.summary.failedJobs.includes('admin-alerts'),'never reports itself');
  assert.ok(d.summary.stuckPayments>=1,'stuck payment');assert.equal(d.pushed,true);
  // The next run starts where this one finished: nothing is reported twice.
  await db.query('UPDATE "SystemJob" SET "lastFinishedAt"=now() AT TIME ZONE \'UTC\' WHERE name=\'admin-alerts\'');
  d=await (await call(secret)).json();
  assert.ok(!d.summary.newErrors.some(e=>e.message.includes(tag)));assert.ok(!d.summary.failedJobs.includes(job));
  console.log(JSON.stringify({ok:true,first:{errors:mine.length,jobs:1,stuck:true},second:d.sent}));
 }finally{
  await db.query('DELETE FROM "SystemError" WHERE fingerprint LIKE $1',[tag+'%']).catch(()=>{});
  await db.query('DELETE FROM "SystemJob" WHERE name LIKE $1',[tag+'%']).catch(()=>{});
  await db.query('DELETE FROM "BankPayment" WHERE id LIKE $1',[tag+'%']).catch(()=>{});
  if(savedAlertsJob)await db.query('UPDATE "SystemJob" SET "lastStartedAt"=$2,"lastFinishedAt"=$3,"lastOk"=$4,"lastError"=$5,"lastResult"=$6,runs=$7,failures=$8 WHERE name=$1',
   ['admin-alerts',savedAlertsJob.lastStartedAt,savedAlertsJob.lastFinishedAt,savedAlertsJob.lastOk,savedAlertsJob.lastError,savedAlertsJob.lastResult,savedAlertsJob.runs,savedAlertsJob.failures]).catch(()=>{});
  else await db.query('DELETE FROM "SystemJob" WHERE name=\'admin-alerts\'').catch(()=>{});
  await db.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
