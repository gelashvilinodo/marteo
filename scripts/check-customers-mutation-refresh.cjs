const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
    let user=null,membership=null,reads=0,closed=0,fail=false;const client={};
    const data={customers:[{id:'keep',firstName:'Updated'}],summary:{total:21},currentPage:2,totalPages:2};
    const mocks={
        '@/lib/auth/session':{getCurrentUser:async()=>user},
        '@/lib/auth/current-business':{getCurrentBusiness:async()=>membership},
        '@/lib/prisma':{createPrismaClient:()=>({...client,$disconnect:async()=>closed++})},
        '@/lib/customers/get-customers-page':{getCustomersPage:async(_client,businessId,params)=>{reads++;assert.equal(businessId,'authorized-business');assert.equal(params.q,'test');assert.equal(params.sort,'orders-desc');assert.equal(params.filter,'repeat');if(fail)throw Error('read failed');return data;}},
        '@/lib/orders/order-http':{orderJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})},
    };
    const exports={};vm.runInNewContext(compile(fs.readFileSync('app/api/customers/list/route.ts','utf8')),{exports,URL,Response,console:{error:()=>{}},require:id=>{assert.ok(id in mocks,id);return mocks[id];}});
    const request={url:'https://marteo.ge/api/customers/list?q=test&sort=orders-desc&filter=repeat&businessId=attacker'};
    assert.equal((await exports.GET(request)).status,401);user={id:'user'};assert.equal((await exports.GET(request)).status,403);assert.equal(reads,0);assert.equal(closed,0);
    membership={businessId:'authorized-business'};const response=await exports.GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(closed,1);
    fail=true;assert.equal((await exports.GET(request)).status,500);assert.equal(closed,2);
    const source=fs.readFileSync('components/dashboard/customers/CustomersView.tsx','utf8');const ast=ts.createSourceFile('view.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
    function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes('window.addEventListener(CUSTOMERS_CHANGED'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(effect);
    const target=new EventTarget();const requests=[];let applied,error,loading,checked=['keep','gone'],selected={id:'keep',firstName:'Old'};
    const window={addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target),dispatchEvent:target.dispatchEvent.bind(target),location:{search:'?q=test&sort=orders-desc&filter=repeat&period=month&page=3',hash:'#list'},history:{state:{keep:true},replaceState(state,_,url){this.last={state,url};}}};
    const context={window,Event,AbortController,URLSearchParams,setTimeout,clearTimeout,CUSTOMERS_CHANGED:'marteo:customers-changed',setRefreshing:v=>loading=v,setRefreshError:v=>error=v,setData:v=>applied=v,setCheckedIds:update=>checked=update(checked),setSelected:update=>selected=update(selected),fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))};
    const cleanup=vm.runInNewContext(compile(`const subscribe=${effect};subscribe();`),context);
    const emit=()=>window.dispatchEvent(new Event(context.CUSTOMERS_CHANGED,{cancelable:true}));const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(emit(),false);emit();await tick();assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/customers/list'+window.location.search);assert.equal(requests[0].options.method,undefined,'Refresh is a GET, never mutation replay');
    emit();await tick();assert.equal(requests[0].options.signal.aborted,true);
    requests[0].resolve({ok:true,json:async()=>({success:true,data})});await tick();assert.equal(applied,undefined);
    requests[1].resolve({ok:true,json:async()=>({success:true,data})});await tick();assert.equal(applied,data);assert.equal(selected.firstName,'Updated');assert.deepEqual(checked,['keep']);assert.equal(loading,false);assert.equal(window.history.last.state.keep,true);assert.match(window.history.last.url,/q=test&sort=orders-desc&filter=repeat&period=month&page=2#list/);
    emit();await tick();requests[2].resolve({ok:false,json:async()=>({message:'failed'})});await tick();assert.equal(error,'failed');assert.equal(applied,data);assert.equal(loading,false);
    emit();await tick();requests[3].resolve({ok:true,json:async()=>({success:true,data:{...data,customers:[],currentPage:1}})});await tick();assert.equal(selected,null);assert.equal(checked.length,0);assert.equal(window.history.last.url.includes('page='),false);
    emit();await tick();window.location.search='?q=changed';requests[4].resolve({ok:true,json:async()=>({success:true,data})});await tick();assert.equal(applied.customers.length,0,'Navigation ignores old data');
    emit();await tick();cleanup();assert.equal(requests[5].options.signal.aborted,true);assert.equal(emit(),true);
    const helper={};vm.runInNewContext(compile(fs.readFileSync('lib/customers/refresh-customers-client.ts','utf8')),{exports:helper,window,Event});let fallback=0;helper.refreshCustomersAfterMutation(()=>fallback++);assert.equal(fallback,1);
    console.log('PASS: auth, tenant scope, query/sort/filter, private-no-store, cleanup on error, read-only refresh, coalescing/abort, stale/navigation reads, counts/selection/details, page clamp, failed reads and route fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
