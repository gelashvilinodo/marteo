/* eslint-disable @typescript-eslint/no-require-imports -- Real database tests are always rolled back. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let current;
const load=Module._load;Module._load=function(id,parent,...args){if(id==='server-only')return {};if(id.endsWith('.wasm?module'))return {default:new WebAssembly.Module(fs.readFileSync(path.resolve(path.dirname(parent.filename),id.replace('?module',''))))};if(id==='@/lib/prisma')return {createPrismaClient:()=>({$transaction:fn=>fn(current),$disconnect:async()=>{}})};return load.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...args)};
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{createHash,randomUUID}=require('node:crypto');
const email=require('../app/api/auth/verify-email-code/route.ts').POST,phone=require('../app/api/auth/verify-phone/route.ts').POST;
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,max:1})});
const rollback=new Error('ROLLBACK_TEST');let passed=0;
const hash=s=>createHash('sha256').update(s).digest('hex');
const request=(fn,userId,code)=>fn(new Request('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost'},body:JSON.stringify({userId,code})}));
(async()=>{try{await prisma.$transaction(async tx=>{
 current=tx;
 const u=await tx.user.create({data:{email:`otp-${randomUUID()}@example.invalid`,phone:randomUUID(),password:'unused',status:'PENDING_VERIFICATION'}});
 const add=(type,code,extra={})=>tx.verificationToken.create({data:{userId:u.id,type,token:hash(code),expiresAt:new Date(Date.now()+600000),...extra}});
 const check=(name,value)=>{assert.ok(value,name);console.log('PASS',name);passed++;};
 await add('EMAIL','111111');
 for(let i=1;i<=5;i++) {const r=await request(email,u.id,'999999');check(`wrong attempt ${i} persists`,r.status===(i===5?429:400)&&(await tx.verificationToken.findFirst({where:{userId:u.id,type:'EMAIL'}})).attempts===i);}
 check('correct code rejected after exhaustion',(await request(email,u.id,'111111')).status===429);
 await tx.verificationToken.deleteMany({where:{userId:u.id}});
 await add('EMAIL','111111',{createdAt:new Date(Date.now()-10000)});await add('EMAIL','222222');
 check('old unused code cannot bypass latest',(await request(email,u.id,'111111')).status===400);
 check('valid email succeeds',(await request(email,u.id,'222222')).status===200);
 check('email replay rejected',(await request(email,u.id,'222222')).status===409);
 await add('PHONE','333333',{expiresAt:new Date(Date.now()-1000)});
 check('expired phone creates no session',(await request(phone,u.id,'333333')).status===400&&await tx.session.count({where:{userId:u.id}})===0);
 await tx.verificationToken.deleteMany({where:{userId:u.id,type:'PHONE'}});await add('PHONE','333333');
 check('wrong phone persists with no session',(await request(phone,u.id,'999999')).status===400&&await tx.session.count({where:{userId:u.id}})===0);
 const response=await request(phone,u.id,'333333');
 check('valid phone activates and sets session cookie',response.status===200&&response.headers.get('set-cookie')?.includes('marteo_session=')&&(await tx.user.findUnique({where:{id:u.id}})).status==='ACTIVE'&&await tx.session.count({where:{userId:u.id}})===1);
 check('phone replay cannot create another session',(await request(phone,u.id,'333333')).status===409&&await tx.session.count({where:{userId:u.id}})===1);
 check('malformed input rejected',(await email(new Request('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost'},body:'{'}))).status===400);
 throw rollback;
 },{isolationLevel:'Serializable',timeout:60000});}catch(e){if(e!==rollback)throw e;}finally{await prisma.$disconnect();}console.log(`${passed} checks passed; all fixtures rolled back; no deliveries.`);})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
