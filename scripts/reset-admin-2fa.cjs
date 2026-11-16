/* eslint-disable @typescript-eslint/no-require-imports -- One-off recovery from the command line. */
// ადმინის ორეტაპიანი შესვლის აღდგენა, როცა ტელეფონიც და სარეზერვო კოდებიც დაკარგულია.
// ბაზაზე წვდომა მხოლოდ შენ გაქვს, ამიტომ ეს გზა ბრაუზერიდან არ არსებობს.
//   node scripts/reset-admin-2fa.cjs admin@example.com            (შემოწმება, არაფერს ცვლის)
//   node scripts/reset-admin-2fa.cjs admin@example.com --apply    (გაუქმება: შემდეგ შესვლაზე QR თავიდან)
require('dotenv').config({quiet:true});
const {Client}=require('pg');
(async()=>{
 const email=process.argv[2];
 if(!email||email.startsWith('--'))throw Error('Usage: node scripts/reset-admin-2fa.cjs <admin email> [--apply]');
 const apply=process.argv.includes('--apply');
 const db=new Client({connectionString:process.env.DIRECT_URL});
 await db.connect();
 try{
  await db.query('BEGIN');
  const {rows}=await db.query('SELECT id,email,"isPlatformAdmin" FROM "User" WHERE lower(email)=lower($1) FOR UPDATE',[email]);
  if(!rows[0])throw Error('No such user');
  if(!rows[0].isPlatformAdmin)throw Error('Not a platform admin');
  const id=rows[0].id;
  const devices=(await db.query('SELECT count(*)::int AS n FROM "AdminTrustedDevice" WHERE "userId"=$1 AND "revokedAt" IS NULL',[id])).rows[0].n;
  const enabled=(await db.query('SELECT "totpEnabledAt" FROM "AdminSecurity" WHERE "userId"=$1',[id])).rows[0]?.totpEnabledAt??null;
  console.log(JSON.stringify({account:rows[0].email,twoFactorEnabled:Boolean(enabled),activeDevices:devices,mode:apply?'apply':'dry-run'}));
  if(apply){
   await db.query('UPDATE "AdminSecurity" SET "totpSecret"=NULL,"pendingSecret"=NULL,"totpEnabledAt"=NULL,"lastTotpStep"=0,"backupCodes"=ARRAY[]::text[],"updatedAt"=now() WHERE "userId"=$1',[id]);
   await db.query('UPDATE "AdminTrustedDevice" SET "revokedAt"=now() WHERE "userId"=$1 AND "revokedAt" IS NULL',[id]);
   await db.query('INSERT INTO "AdminAuditLog" (id,"adminId",action,"targetType","targetId","createdAt") VALUES (gen_random_uuid()::text,NULL,\'admin-2fa-reset\',\'USER\',$1,now())',[id]);
   await db.query('COMMIT');
   console.log('Reset. Next visit to /admin starts the QR setup again.');
  }else await db.query('ROLLBACK');
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
 finally{await db.end()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
