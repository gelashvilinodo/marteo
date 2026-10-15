const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const load = (path, mocks) => {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: id => { if (id === 'server-only') return {}; if (!(id in mocks)) throw new Error('Unexpected import: '+id); return mocks[id]; }, URL, Response, console });
    return exports;
};
(async () => {
    const calls = []; const tx = {}; let disconnected = 0; let fail = false;
    const params = { period: 'custom', from: '2026-10-01', to: '2026-10-15', movement: 'expense', page: '4' };
    const summary = { from: params.from, to: params.to, sales: '100.00', costOfGoods: '20.00', recordedExpenses: '30.00', profit: '50.00' };
    const functions = {
        './get-analytics-page': { getAnalyticsPage: async (...args) => { calls.push(['summary',...args]); return summary; } },
        './get-financial-movements': { getFinancialMovements: async (...args) => { calls.push(['movements',...args]); return { rows: [], page: 3, source: 'expense' }; } },
        './get-current-balances': { getCurrentBalances: async (...args) => { calls.push(['balances',...args]); return { receivable: '25.00' }; } },
        './get-financial-trend': { getFinancialTrend: async (...args) => { calls.push(['trend',...args]); if(fail) throw new Error('read failed'); return [{ profit: '50.00' }]; } },
        './get-expense-breakdown': { getExpenseBreakdown: async (...args) => { calls.push(['breakdown',...args]); return { total: '50.00' }; } },
    };
    const helper = load('lib/analytics/get-analytics-snapshot.ts', {
        ...functions, '@/generated/prisma/client': { Prisma: { TransactionIsolationLevel: { RepeatableRead: 'RepeatableRead' } } },
        '@/lib/prisma': { createPrismaClient: () => ({ $disconnect: async () => { disconnected++; }, $transaction: async (callback, options) => {
            assert.equal(options.isolationLevel, 'RepeatableRead'); return callback(tx);
        } }) },
    });
    const snapshot = await helper.getAnalyticsSnapshot('business-A', params, 'month');
    assert.equal(disconnected, 1); assert.equal(snapshot.data.profit, '50.00'); assert.equal(snapshot.data.receivable, '25.00');
    assert.equal(snapshot.trendPeriod, 'month');
    for(const call of calls) { assert.equal(call[1], tx); assert.equal(call[2], 'business-A'); }
    assert.equal(calls[1][3], params.from); assert.equal(calls[1][4], params.to); assert.equal(calls[1][5], params);
    assert.equal(calls[3][3], 'month');
    fail = true; await assert.rejects(helper.getAnalyticsSnapshot('business-A', params), /read failed/); assert.equal(disconnected, 2);
    let user = null, membership = null, reads = 0;
    const route = load('app/api/analytics/snapshot/route.ts', {
        '@/lib/auth/session': { getCurrentUser: async () => user },
        '@/lib/auth/current-business': { getCurrentBusiness: async () => membership },
        '@/lib/analytics/get-analytics-snapshot': { getAnalyticsSnapshot: async (id, query, period) => { reads++; assert.equal(id, 'authorized-business'); assert.equal(query.movement, 'expense'); assert.equal(period, 'year'); return snapshot; } },
        '@/lib/orders/order-http': { orderJson: (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}}), orderError: () => Response.json({success:false},{status:500}) },
    });
    const req = period => ({ url: 'https://marteo.ge/api/analytics/snapshot?movement=expense&businessId=attacker&trendPeriod='+period });
    assert.equal((await route.GET(req('year'))).status, 401);
    user = { id: 'user' }; assert.equal((await route.GET(req('year'))).status, 403);
    membership = { businessId:'authorized-business' };
    assert.equal((await route.GET(req('bad'))).status, 400); assert.equal(reads, 0);
    const response = await route.GET(req('year')); assert.equal(response.status, 200); assert.equal(reads, 1); assert.equal(response.headers.get('Cache-Control'),'private, no-store');

    const source = fs.readFileSync('components/dashboard/analytics/AnalyticsView.tsx','utf8');
    const ast = ts.createSourceFile('AnalyticsView.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX); let effect;
    function visit(n) { if(ts.isCallExpression(n) && n.expression.getText(ast)==='useEffect' && n.arguments[0].getText(ast).includes('window.addEventListener(ANALYTICS_CHANGED')) effect=n.arguments[0].getText(ast); ts.forEachChild(n,visit); } visit(ast); assert.ok(effect);
    const target = new EventTarget(); const requests=[]; let applied, error, loading;
    const window = { dispatchEvent:target.dispatchEvent.bind(target), addEventListener:target.addEventListener.bind(target), removeEventListener:target.removeEventListener.bind(target),
        location:{search:'?period=custom&from=2026-10-01&to=2026-10-15&movement=expense&page=4',hash:'#list'}, history:{state:{preserved:true},replaceState(state,_,url){this.last={state,url};}} };
    const context = { window, Event, AbortController, URLSearchParams, setTimeout, clearTimeout, ANALYTICS_CHANGED:'marteo:analytics-changed',trendPeriod:{current:'month'},
        setRefreshing:v=>{loading=v;},setError:v=>{error=v;},setSnapshot:v=>{applied=v;},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})) };
    const cleanup = vm.runInNewContext(ts.transpileModule(`const subscribe=${effect};subscribe();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
    const emit=()=>target.dispatchEvent(new Event(context.ANALYTICS_CHANGED,{cancelable:true})); const tick=()=>new Promise(r=>setTimeout(r,5));
    emit();emit();await tick();assert.equal(requests.length,1);assert.match(requests[0].url,/trendPeriod=month/);assert.match(requests[0].url,/movement=expense/);
    emit();await tick();assert.equal(requests[0].options.signal.aborted,true);
    const body = {success:true,data:snapshot};
    requests[0].resolve({ok:true,json:async()=>body});await tick();assert.equal(applied,undefined);
    requests[1].resolve({ok:true,json:async()=>body});await tick();assert.equal(applied,snapshot);assert.equal(loading,false);
    assert.match(window.history.last.url,/page=3/);assert.match(window.history.last.url,/from=2026-10-01/);assert.equal(window.history.last.state.preserved,true);
    emit();await tick();requests[2].resolve({ok:false,json:async()=>({message:'failed'})});await tick();assert.equal(error,'failed');assert.equal(applied,snapshot);
    emit();await tick();context.trendPeriod.current='year';requests[3].resolve({ok:true,json:async()=>body});await tick();assert.equal(requests.length,5);assert.match(requests[4].url,/trendPeriod=year/);
    cleanup();assert.equal(requests[4].options.signal.aborted,true);assert.equal(emit(),true);
    console.log('PASS: transaction consistency, business scope, formulas preserved, cleanup on failure, auth/validation/no-store, coalescing, stale reads, filters, page correction, failed-read preservation, chart period race and unmount');
})().catch(error=>{console.error(error);process.exitCode=1;});
