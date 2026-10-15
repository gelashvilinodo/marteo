const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('components/dashboard/orders/OrdersView.tsx', 'utf8');
const ast = ts.createSourceFile('OrdersView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
        node.arguments[0].getText(ast).includes('window.addEventListener(ORDERS_CHANGED')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'Production mutation subscription exists');
const eventName = 'marteo:orders-changed';
const target = new EventTarget();
const calls = [];
let data, error, loading, checked = ['keep', 'gone'];
const window = { dispatchEvent: target.dispatchEvent.bind(target), addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
    location: { search: '?status=completed&q=test&sort=amount-desc&page=3', hash: '#orders-list' },
    history: { state: { existing: true }, replaceState(state, _, url) { this.last = { state, url }; } } };
const context = { window, Event, AbortController, URLSearchParams, setTimeout, clearTimeout,
    ORDERS_CHANGED: eventName, refreshVersion: { current: 0 }, selectedId: { current: null },
    listEndpoint: '/api/orders/list', basePath: '/dashboard/orders',
    setMutationLoading: value => { loading = value; }, setData: value => { data = value; },
    setCheckedIds: update => { checked = update(checked); }, setPrintError: value => { error = value; },
    setSelected: update => { context.selection = update(context.selection); },
    fetch(url, options) { return new Promise(resolve => calls.push({ url, options, resolve })); } };
const js = ts.transpileModule(`const subscribe = ${effect}; subscribe();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const cleanup = vm.runInNewContext(js, context);
const emit = () => target.dispatchEvent(new Event(eventName, { cancelable: true }));
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
(async () => {
    assert.equal(emit(), false); emit(); await tick();
    assert.equal(calls.length, 1, 'Synchronous notifications coalesce');
    assert.equal(calls[0].url, '/api/orders/list' + window.location.search);
    emit(); await tick();
    assert.equal(calls[0].options.signal.aborted, true);
    assert.equal(calls.length, 2);
    calls[0].resolve({ ok: true, json: async () => ({ success: true, data: { orders: [], currentPage: 1 } }) });
    await tick(); assert.equal(data, undefined, 'Superseded response ignored');
    calls[1].resolve({ ok: true, json: async () => ({ success: true, data: { orders: [{ id: 'keep' }], currentPage: 2 } }) });
    await tick();
    assert.equal(data.currentPage, 2); assert.deepEqual(checked, ['keep']); assert.equal(loading, false);
    assert.equal(window.history.last.url, '/dashboard/orders?status=completed&q=test&sort=amount-desc&page=2#orders-list');
    assert.deepEqual(window.history.last.state, { existing: true });
    emit(); await tick();
    calls[2].resolve({ ok: false, json: async () => ({ message: 'Read failed' }) });
    await tick(); assert.equal(error, 'Read failed'); assert.equal(data.currentPage, 2);
    context.selectedId.current = 'keep'; context.selection = { id: 'keep', notes: 'old' };
    emit(); await tick();
    calls[3].resolve({ ok: true, json: async () => ({ success: true, data: { orders: [{ id: 'keep' }], currentPage: 1 } }) });
    await tick(); assert.equal(calls[4].url, '/api/orders/keep/details');
    calls[4].resolve({ ok: true, json: async () => ({ success: true, order: { id: 'keep', detailsLoaded: true, notes: 'new' } }) });
    await tick(); assert.equal(context.selection.notes, 'new');
    assert.equal(window.history.last.url.includes('page='), false, 'First page removes stale page parameter');
    emit(); await tick();
    calls[5].resolve({ ok: true, json: async () => ({ success: true, data: { orders: [], currentPage: 1 } }) });
    await tick(); assert.equal(context.selection, null, 'Removed selected row closes stale detail');
    emit(); await tick(); cleanup();
    assert.equal(calls[6].options.signal.aborted, true); assert.equal(emit(), true);
    let fallback = 0;
    const helper = ts.transpileModule(fs.readFileSync('lib/orders/refresh-orders-client.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exported = {}; vm.runInNewContext(helper, { exports: exported, window, Event });
    exported.refreshOrdersAfterMutation(() => fallback++);
    assert.equal(fallback, 1, 'Other routes retain fallback');
    console.log('PASS: coalescing, cancellation, stale response, filters, page clamp, selection, read failure, cleanup and route fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
