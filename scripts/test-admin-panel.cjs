/* eslint-disable @typescript-eslint/no-require-imports -- Isolated security regression tests. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file, deps) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports, require(id){if(id==='server-only')return {};if(id in deps)return deps[id];throw Error(id)}, Date, Intl, Response, console:{error(){}}});
 return exports;
}
let token, rows=[], opened=0, closed=0, queries=[];
const reader={createPgReader(){opened++;return {$queryRaw:async(parts,...values)=>{queries.push({sql:parts.join('?'),values});return rows},$disconnect:async()=>{closed++}}}};
const auth=load('lib/admin/authorization.ts',{'crypto':require('node:crypto'),'next/headers':{cookies:async()=>({get:()=>token?{value:token}:undefined})},react:{cache:fn=>fn},'@/lib/database/pg-reader':reader});
let allowed=false;
const overview=load('lib/admin/overview.ts',{'./authorization':{getAdminUser:async()=>allowed?{id:'owner'}:null},'@/lib/database/pg-reader':reader});
const route=load('app/api/admin/overview/route.ts',{'@/lib/admin/overview':overview});
(async()=>{
 assert.equal(await auth.getAdminUser(),null);assert.equal(opened,0);
 token='secret-token';rows=[];assert.equal(await auth.getAdminUser(),null);
 const q=queries.at(-1);assert.ok(!q.sql.includes(token));assert.equal(q.values[0],require('node:crypto').createHash('sha256').update(token).digest('hex'));
 assert.match(q.sql,/s\."expiresAt" > /);assert.match(q.sql,/u.status = 'ACTIVE'/);assert.match(q.sql,/to_jsonb\(u\)->>'isPlatformAdmin' = 'true'/);assert.ok(!q.sql.includes('BusinessMembership'));
 rows=[{id:'owner'}];assert.equal((await auth.getAdminUser()).id,'owner');assert.equal(opened,closed);
 const day=overview.getTbilisiDay(new Date('2026-10-28T20:00:00Z'));assert.equal(day.date,'2026-10-29');assert.equal(day.start.toISOString(),'2026-10-28T20:00:00.000Z');assert.equal(day.end.toISOString(),'2026-10-29T20:00:00.000Z');
 assert.equal(overview.getTbilisiDay(new Date('2026-10-28T19:59:59Z')).date,'2026-10-28');
 let before=opened;await assert.rejects(overview.getAdminOverview(),overview.AdminAccessError);assert.equal(opened,before);
 let r=await route.GET();assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'private, no-store');
 allowed=true;rows=[{totalBusinesses:7,users:0,newBusinessesToday:1,orders:2,invoices:0,movements:3}];r=await route.GET();assert.equal(r.status,200);const data=await r.json();assert.equal(data.orders,2);assert.equal(data.totalBusinesses,7);assert.equal(data.newBusinessesToday,1);assert.equal(opened,closed);
 assert.equal(queries.at(-1).values.length,2);assert.match(queries.at(-1).sql,/FROM "User"\)/);assert.match(queries.at(-1).sql,/FROM "InventoryMovement"\)/);assert.match(queries.at(-1).sql,/"invoicePrintedAt" IS NOT NULL/);
 assert.match(queries.at(-1).sql,/"deletedAt" IS NULL/);assert.match(queries.at(-1).sql,/"invoicePrintedAt"/);
 rows=[];r=await route.GET();assert.equal(r.status,500);assert.ok(!(await r.text()).includes('Missing overview'));assert.equal(opened,closed);
 console.log('PASS: absent session, hashed session, DB-only privilege, active/unexpired checks, default deny, data guard, API 403/200/500, no-store, cleanup, Tbilisi midnight and real zero values.');
})().catch(error=>{console.error(error);process.exitCode=1});
