/* eslint-disable @typescript-eslint/no-require-imports -- Explicit operator-only DB provisioning. */
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const email=process.argv.find(arg=>arg.startsWith('--email='))?.slice(8);
if(!email) { console.error('Provide --email=<existing account>. Default is dry-run; --apply grants access.'); process.exit(1); }
(async()=>{
 const db=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:10000});
 try {
  await db.connect();await db.query('BEGIN');
  await db.query('LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE');
  const {rows}=await db.query('SELECT id,email,status,"isPlatformAdmin" FROM "User" WHERE lower(email)=lower($1) FOR UPDATE',[email]);
  if(rows.length!==1||rows[0].status!=='ACTIVE')throw Error('Expected exactly one active account');
  const others=await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND id<>$1',[rows[0].id]);
  if(others.rowCount)throw Error('Another platform owner already exists');
  console.log(JSON.stringify({account:rows[0].email,alreadyAdmin:rows[0].isPlatformAdmin,mode:process.argv.includes('--apply')?'apply':'dry-run'}));
  if(process.argv.includes('--apply')) {
   const before=await db.query('SELECT to_jsonb(b)::text AS snapshot FROM "Business" b JOIN "BusinessMembership" m ON m."businessId"=b.id WHERE m."userId"=$1 ORDER BY b.id',[rows[0].id]);
   await db.query('UPDATE "User" SET "isPlatformAdmin"=true WHERE id=$1',[rows[0].id]);
   const after=await db.query('SELECT to_jsonb(b)::text AS snapshot FROM "Business" b JOIN "BusinessMembership" m ON m."businessId"=b.id WHERE m."userId"=$1 ORDER BY b.id',[rows[0].id]);
   if(JSON.stringify(before.rows)!==JSON.stringify(after.rows))throw Error('Business snapshot changed');
   await db.query('COMMIT');console.log('Platform owner granted. Business records unchanged.');
  } else await db.query('ROLLBACK');
 } catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Platform owner provisioning failed:', ['Expected exactly one active account','Another platform owner already exists','Business snapshot changed'].includes(error.message)?error.message:'Database error');process.exitCode=1}
 finally{await db.end()}
})().catch(()=>{console.error('Provisioning failed');process.exitCode=1});
