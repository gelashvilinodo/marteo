/* eslint-disable @typescript-eslint/no-require-imports -- Isolated schema, no provider requests or customer changes. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const {Pool}=require('pg'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const load=Module._load;let cloud=false;let renderedMail;let sessions=0;let passwordHash;
Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id==='@/lib/prisma')return {createPrismaClient:()=>({...db,$disconnect:async()=>{},user:{findUnique:async({where})=>where.email==='known@example.invalid'?{id:'qa-user',password:passwordHash,status:'ACTIVE',emailVerifiedAt:new Date(),phoneVerifiedAt:new Date()}:null},session:{create:async()=>{sessions++;}}})};if(id==='resend')return {Resend:class{emails={send:async payload=>{renderedMail=payload;return {data:{id:'qa'},error:null};}}}};if(id==='@opennextjs/cloudflare')return {getCloudflareContext:()=>{if(!cloud)throw Error('local');return {};}};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {reserveLimits,RateLimitError,rateLimitResponse,requestIp}=require('../lib/security/rate-limit.ts');
const {normalizePhone,isAllowedSmsPhone}=require('../lib/security/phone.ts');const {escapeHtml}=require('../lib/security/html.ts');
const schema='qa_security_'+randomUUID().replaceAll('-','');
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:12});
let passed=0;const check=(name,value)=>{assert.ok(value,name);console.log('PASS',name);passed++;};
const query=(c,parts,values)=>c.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values);
const db={$transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}"`);const value=await fn({$queryRaw:async(parts,...values)=>(await query(c,parts,values)).rows,$executeRaw:async(parts,...values)=>(await query(c,parts,values)).rowCount});await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
const limit=(scope,maximum=5)=>({scope,identity:'test@example.invalid',maximum,seconds:600});
(async()=>{try{
 await pool.query(`CREATE SCHEMA "${schema}"`);await pool.query(`SET search_path TO "${schema}"`);
 // Explicit schema qualification avoids dependence on pool connection reuse.
 const sql=fs.readFileSync(path.join(root,'prisma/migrations/20261026120000_security_rate_buckets/migration.sql'),'utf8').replaceAll('"SecurityRateBucket"',`"${schema}"."SecurityRateBucket"`);
 await pool.query(sql);
 const results=await Promise.all(Array.from({length:20},()=>reserveLimits(db,[limit('parallel')]).then(()=>true,e=>{if(e instanceof RateLimitError)return false;throw e;})));
 check('20 simultaneous requests admit exactly five',results.filter(Boolean).length===5);
 const denied=await reserveLimits(db,[limit('parallel')]).catch(e=>e);check('denial returns 429 with Retry-After',rateLimitResponse(denied)?.status===429&&Number(rateLimitResponse(denied).headers.get('retry-after'))>0);
 await reserveLimits(db,[limit('z-blocked',1)]);
 await reserveLimits(db,[limit('a-rollback'),limit('z-blocked',1)]).catch(e=>{assert.ok(e instanceof RateLimitError);});
 check('denial rolls back other reservations',(await pool.query(`SELECT count(*)::int AS n FROM "${schema}"."SecurityRateBucket" WHERE "key" LIKE 'a-rollback:%'`)).rows[0].n===0);
 await pool.query(`UPDATE "${schema}"."SecurityRateBucket" SET "expiresAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 second'`);
 await reserveLimits(db,[limit('parallel')]);check('expired window recovers with count one',(await pool.query(`SELECT "count" FROM "${schema}"."SecurityRateBucket" WHERE "key" LIKE 'parallel:%'`)).rows[0].count===1);
 check('recipient identifiers not stored raw',!(JSON.stringify((await pool.query(`SELECT * FROM "${schema}"."SecurityRateBucket"`)).rows)).includes('test@example'));
 const spoof=new Request('http://localhost',{headers:{'cf-connecting-ip':'1.2.3.4','x-forwarded-for':'8.8.8.8'}});
 check('untrusted local proxy headers ignored',requestIp(spoof)==='unavailable');cloud=true;
 check('Cloudflare client IP used',requestIp(spoof)==='1.2.3.4');
 check('IPv6 addresses aggregate by /64',requestIp(new Request('http://localhost',{headers:{'cf-connecting-ip':'2001:db8::1234'}}))===requestIp(new Request('http://localhost',{headers:{'cf-connecting-ip':'2001:db8::abcd'}})));
 check('Georgian local phone normalized',normalizePhone('599 12-34-56')==='+995599123456');
 delete process.env.SMS_ALLOWED_COUNTRY_CODES;
 check('valid Georgian mobile allowed',isAllowedSmsPhone('+995599123456'));
 check('foreign, landline and malformed rejected',['+15551234567','+995322123456','+99559912345','abc'].every(v=>!isAllowedSmsPhone(v)));
 process.env.SMS_ALLOWED_COUNTRY_CODES='995,44';check('explicit extra country supported',isAllowedSmsPhone('+447700900123'));
 check('HTML links and quotes escaped',escapeHtml('<a href="x">Tom & \'Sam\'</a>')==='&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Sam&#39;&lt;/a&gt;');
 check('plain text preserved',escapeHtml('Nodo 123')==='Nodo 123');
 // Invoke the real login route against the same DB-backed limiter, with isolated user/session doubles.
 const bcrypt=require('bcryptjs');passwordHash=bcrypt.hashSync('correct-password',4);
 const login=require('../app/api/auth/login/route.ts').POST;
 const signIn=password=>login(new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify({email:'known@example.invalid',password})}));
 for(let i=0;i<5;i++)assert.equal((await signIn('wrong-password')).status,401);
 check('login throttle blocks even correct password after burst',(await signIn('correct-password')).status===429&&sessions===0);
 await pool.query(`UPDATE "${schema}"."SecurityRateBucket" SET "expiresAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 second' WHERE "key" LIKE 'login-%'`);
 const signedIn=await signIn('correct-password');
 check('login recovers and sets cookie after cooldown',signedIn.status===200&&sessions===1&&signedIn.headers.get('set-cookie').includes('marteo_session='));
 process.env.RESEND_API_KEY='qa-only-not-real';process.env.RESEND_FROM_EMAIL='qa@example.invalid';
 await require('../lib/email/index.ts').sendVerificationEmail({to:'qa@example.invalid',firstName:'<a href="evil">name</a>',token:'123456'});
 check('actual email payload escapes name but preserves OTP',renderedMail.html.includes('&lt;a href=&quot;evil&quot;&gt;name&lt;/a&gt;')&&!renderedMail.html.includes('<a href="evil">')&&renderedMail.html.includes('123456'));
 // A provider timeout is still one reserved delivery. No real network is used.
 delete process.env.SMS_ALLOWED_COUNTRY_CODES;process.env.SENDSMS_API_KEY='qa-only';process.env.SENDSMS_SENDER='QA';process.env.SMS_DAILY_SEND_LIMIT='2';
 const sendSms=require('../lib/sms/index.ts').sendSms;
 let providerCalls=0;global.fetch=async()=>{providerCalls++;throw new Error('simulated timeout');};
 await assert.rejects(()=>sendSms({phone:'+995599000001',message:'qa'}));
 await assert.rejects(()=>sendSms({phone:'+995599000001',message:'qa'}),RateLimitError);
 check('uncertain SMS is not retried inside cooldown',providerCalls===1);
 await assert.rejects(()=>sendSms({phone:'+995599000002',message:'qa'}));
 await assert.rejects(()=>sendSms({phone:'+995599000003',message:'qa'}),RateLimitError);
 check('global SMS cap prevents third provider call',providerCalls===2);
 await assert.rejects(()=>sendSms({phone:'+15551234567',message:'qa'}));
 check('unsupported country never contacts provider',providerCalls===2);

 console.log(`${passed} checks passed; no SMS/email sent.`);
 }finally{await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
