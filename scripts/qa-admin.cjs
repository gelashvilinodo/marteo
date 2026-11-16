/* eslint-disable @typescript-eslint/no-require-imports -- Shared helper for local admin QA scripts. */
// ბაზაში მხოლოდ ერთი პლატფორმის ადმინი შეიძლება იყოს, ამიტომ QA რეალური ადმინის ანგარიშით მუშაობს,
// მაგრამ მხოლოდ საკუთარ ჩანაწერებს ამატებს (სესია, სანდო მოწყობილობა და, თუ ჯერ არ არის, ჩართული 2FA)
// და cleanup() ზუსტად მათ შლის. პაროლს, არსებულ 2FA-ს და მოწყობილობებს არ ეხება.
const {randomBytes,createHash}=require('node:crypto');
async function createQaAdmin(db,tag){
 const admins=(await db.query('SELECT id FROM "User" WHERE "isPlatformAdmin" AND status=\'ACTIVE\'')).rows;
 if(admins.length!==1)throw Error('Expected exactly one active platform admin');
 const id=admins[0].id,session=randomBytes(32).toString('hex'),device=randomBytes(32).toString('hex');
 const day=new Date(Date.now()+86400000).toISOString();
 const security=(await db.query('SELECT "totpEnabledAt","pendingSecret" FROM "AdminSecurity" WHERE "userId"=$1',[id])).rows[0];
 if(security&&!security.totpEnabledAt)throw Error('Admin 2FA setup is half done; finish it before running QA');
 const addedSecurity=!security;
 if(addedSecurity)await db.query('INSERT INTO "AdminSecurity" ("userId","totpSecret","totpEnabledAt","updatedAt") VALUES ($1,\'JBSWY3DPEHPK3PXP\',now(),now())',[id]);
 const deviceId=tag+'-device',sessionId=tag+'-session';
 await db.query('INSERT INTO "AdminTrustedDevice" (id,"userId","tokenHash",label,"expiresAt") VALUES ($1,$2,$3,\'QA\',$4)',[deviceId,id,createHash('sha256').update('marteo-admin-device:'+device).digest('hex'),day]);
 await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',[sessionId,id,createHash('sha256').update(session).digest('hex'),day]);
 return {
  id,
  cookie:`marteo_session=${session}; marteo_admin_device=${device}`,
  // ძველი სკრიპტებისთვის, რომლებიც Cookie-ს 'marteo_session='+token-ით აწყობენ.
  token:`${session}; marteo_admin_device=${device}`,
  // მხოლოდ მაშინ, როცა QA-მ თვითონ ჩართო 2FA: ამ გასაღებით ტესტს სახიფათო ქმედების კოდის გამოთვლა შეუძლია.
  secret:addedSecurity?'JBSWY3DPEHPK3PXP':null,
  async cleanup(){
   await db.query('DELETE FROM "Session" WHERE id=$1',[sessionId]).catch(()=>{});
   await db.query('DELETE FROM "AdminTrustedDevice" WHERE id=$1',[deviceId]).catch(()=>{});
   if(addedSecurity)await db.query('DELETE FROM "AdminSecurity" WHERE "userId"=$1 AND "totpSecret"=\'JBSWY3DPEHPK3PXP\'',[id]).catch(()=>{});
  },
 };
}
module.exports={createQaAdmin};
