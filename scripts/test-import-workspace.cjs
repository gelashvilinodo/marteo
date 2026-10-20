/* eslint-disable @typescript-eslint/no-require-imports -- UI callbacks tested without a browser or database. */
const fs = require('fs'), path = require('path'), Module = require('module'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..'), ts = require(root + '/node_modules/typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, f);
const oldLoad = Module._load, realReact = require(root + '/node_modules/react');
let state = [], refs = [], cursor = 0, refCursor = 0;
const react = { ...realReact, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useMemo: fn => fn(), useEffect() {} };
const stubs = new Map();
Module._load = function(id, parent, ...args) {
    if (id === 'react') return react;
    if (id.includes('read-import-file-client')) return { readImportFile: () => { throw Error('Unexpected file upload'); } };
    if (parent?.filename.endsWith('/ImportWorkspace.tsx') && id.startsWith('./')) {
        if (!stubs.has(id)) stubs.set(id, { __esModule: true, default: function Child() {} });
        return stubs.get(id);
    }
    return oldLoad.call(this, id.startsWith('@/') ? root + '/' + id.slice(2) : id, parent, ...args);
};
global.window = { scrollTo() {} };
global.document = { getElementById: () => ({ scrollIntoView() {} }) };
const Workspace = require(root + '/components/dashboard/imports/ImportWorkspace.tsx').default;
function render() { cursor = 0; refCursor = 0; return Workspace(); }
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const child = (tree, name) => nodes(tree).find(n => n.type === stubs.get('./' + name)?.default);
const button = (tree, text) => nodes(tree).find(n => n.type === 'button' && n.props.children === text);
const { createDiscoveredMappings } = require(root + '/lib/imports/discover-import-sources.ts');
const file = { originalName: 'test.xlsx', sha256: 'a'.repeat(64), format: 'xlsx', excelDateSystem: '1900', issues: [], sheets: [{ name: 'პროდუქტები', hidden: false, mergedRanges: [], rows: [['product name', 'current stock'], ['Cup', 5]].map((cells, i) => ({ rowNumber: i + 1, cells: cells.map((value, c) => ({ address: String.fromCharCode(65 + c) + (i + 1), value, displayText: null, formula: null, errorCode: null, numberFormat: null })) })) }] };
function open({ duplicates = [], completed = [] } = {}) {
    const tree = render(), auto = createDiscoveredMappings(file);
    child(tree, 'ImportDraftPicker').props.onOpen({ hasSavedSettings: true, draft: { id: 'draft', status: completed.length ? 'PARTIAL' : 'DRAFT', revision: 1 }, completedSections: { customers: completed.includes('customers'), products: completed.includes('products'), orders: false }, files: [{ clientFileId: 'f', file, photos: [], photoManifest: null }], settings: { workspaceVersion: 1, customerMappings: auto.customers, customerEdits: {}, excludedCustomerKeys: [], existingCustomerLinks: {}, productMappings: { f: auto.products }, productEdits: {}, excludedProductKeys: [], existingProductLinks: {}, productDuplicateDecisions: duplicates, productStockDate: null, productStockPolicy: null, productPhotoDecisions: [] } });
    return render();
}
let checks = 0;
function test(name, fn) { state = []; refs = []; fn(); checks++; console.log('PASS', name); }
test('restoring a draft restores duplicate decisions instead of silently clearing them', () => {
    const decisions = [{ groupToken: 'saved-token', action: 'KEEP_SEPARATE' }];
    assert.deepEqual(child(open({ duplicates: decisions }), 'ImportProductsSummary').props.duplicateDecisions, decisions);
});
test('missing date blocks continuation but explicitly skipping products proceeds', () => {
    let tree = open();
    child(tree, 'ImportDraftSaveButton').props.onReviewCategory('products'); tree = render();
    button(tree, 'შეჯამება და შენახვა').props.onClick(); tree = render();
    assert(nodes(tree).some(n => n.props?.['aria-current'] === 'step' && JSON.stringify(n.props.children).includes('პროდუქტები')));
    button(tree, 'ამ კატეგორიის გამოტოვება').props.onClick(); tree = render();
    assert(nodes(tree).some(n => n.props?.['aria-current'] === 'step' && JSON.stringify(n.props.children).includes('გადმოტანა')));
    assert.equal(child(tree, 'ImportDraftSaveButton').props.settings.productMappings.f['პროდუქტები'].enabled, false);
});
test('partial completion keeps the remaining import visible, final completion replaces the form', () => {
    let tree = open();
    child(tree, 'ImportDraftSaveButton').props.onSectionImported('customers', false); tree = render();
    assert(child(tree, 'ImportDraftSaveButton'));
    child(tree, 'ImportDraftSaveButton').props.onSectionImported('products', true); tree = render();
    assert.equal(child(tree, 'ImportDraftSaveButton'), undefined);
    assert(nodes(tree).some(n => n.type === 'h1' && n.props.children === 'იმპორტი წარმატებით დასრულდა'));
    button(tree, 'ახალი იმპორტის დაწყება').props.onClick(); tree = render();
    assert(child(tree, 'ImportDraftPicker'));
    assert.equal(child(tree, 'ImportDraftSaveButton'), undefined);
    assert.equal(button(tree, 'ახალი იმპორტის დაწყება'), undefined);
});
console.log(checks + ' real workspace callback checks passed; child components stubbed, no network/database writes');
