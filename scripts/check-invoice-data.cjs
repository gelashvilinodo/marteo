const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { Decimal } = require("@prisma/client-runtime-utils");
const root = path.resolve(__dirname, "..");

function load(file, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        exports, require(name) {
            if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
            return imports[name];
        },
        Response, URL, Date, Map, performance, console: { info() {}, error() {} },
    });
    return exports;
}

const prismaModule = { Prisma: { Decimal } };
const query = load("lib/orders/get-invoice-order.ts", { "@/generated/prisma/client": prismaModule });
const payable = load("lib/orders/order-payable-total.ts", { "@/generated/prisma/client": prismaModule });
let row;
let reads;
let disconnected;
const client = {
    businessMembership: { findFirst: async () => ({ businessId: "business-a" }) },
    async $queryRaw(strings, orderId, businessId) {
        reads++;
        assert.equal(orderId, "order-a");
        assert.equal(businessId, "business-a");
        // Parameters must stay bound, and deleted/other-tenant orders excluded.
        const sql = strings.join("?");
        assert.ok(sql.includes('o."businessId" = ?'));
        assert.ok(sql.includes('o."deletedAt" IS NULL'));
        assert.ok(sql.includes('r."fulfillmentCycle" = o."fulfillmentCycle"'));
        assert.ok(sql.includes('SUM(p."amount")'));
        return row ? [row] : [];
    },
    async $disconnect() { disconnected++; },
};
const route = load("app/api/orders/[orderId]/invoice/route.ts", {
    "@/generated/prisma/client": prismaModule,
    "@/lib/orders/get-invoice-order": query,
    "@/lib/orders/order-payable-total": payable,
    "@/lib/auth/session": { getCurrentUserWithClient: async get => {
        get(); return { id: "user-a" };
    } },
    "@/lib/prisma": { createPrismaClient: () => client },
});

const base = {
    number: 36, createdAt: new Date("2026-10-14T10:00:00Z"),
    status: "PROCESSING", paymentStatus: "UNPAID", notes: null,
    recipientFirstName: null, recipientLastName: null, recipientPhone: "test",
    shippingAddress: null, courierFee: "0.20", stockReturnedAt: null,
    fulfillmentCycle: 1, publicAccessToken: null, invoiceVersion: 2,
    lastPrintedInvoiceVersion: 1, invoicePrintedAt: null,
    business: { name: "test", logoUrl: null, phone: null, email: null, address: null },
    items: [{ id: "item-a", name: "test", color: null, size: null,
        condition: "GOOD", quantity: 3, unitPrice: "0.10" }],
    returns: [], paidAmount: "0",
};
const returned = quantity => [{ fulfillmentCycle: 1,
    items: [{ orderItemId: "item-a", quantity }] }];
const cases = [
    [{}, "0.30", "0.50", "0.50", "0.00", 3],
    [{ paidAmount: "0.10" }, "0.30", "0.50", "0.40", "0.00", 3],
    [{ paidAmount: "0.60" }, "0.30", "0.50", "0.00", "0.10", 3],
    [{ paidAmount: "-0.40" }, "0.30", "0.50", "0.90", "0.00", 3],
    [{ returns: returned(1) }, "0.20", "0.40", "0.40", "0.00", 2],
    [{ returns: [...returned(1), ...returned(2)] }, "0.00", "0.20", "0.20", "0.00", 0],
    [{ stockReturnedAt: new Date(), paidAmount: "0.50" }, "0.00", "0.20", "0.00", "0.30", 0],
    [{ items: [] }, "0.00", "0.20", "0.20", "0.00", 0],
    [{ publicAccessToken: "test-link", lastPrintedInvoiceVersion: 2 }, "0.30", "0.50", "0.50", "0.00", 3],
];

(async () => {
    for (const [change, products, total, remaining, refund, quantity] of cases) {
        row = { ...base, ...change }; reads = 0; disconnected = 0;
        const response = await route.GET(new Request("https://example.test/invoice"), {
            params: Promise.resolve({ orderId: "order-a" }),
        });
        assert.equal(response.status, 200);
        const { invoice } = await response.json();
        assert.equal(invoice.productsTotal, products);
        assert.equal(invoice.total, total);
        assert.equal(invoice.remainingAmount, remaining);
        assert.equal(invoice.refundDue, refund);
        assert.equal(invoice.items.reduce((n, i) => n + i.quantity, 0), quantity);
        assert.equal(invoice.createdAt, base.createdAt.toISOString());
        assert.equal(invoice.qrDataUrl, null);
        assert.equal(reads, 1); assert.equal(disconnected, 1);
        assert.equal(invoice.printState, row.lastPrintedInvoiceVersion === 2 ? "PRINTED" : "UPDATED");
    }
    row = { ...base, returns: returned(4) }; reads = 0; disconnected = 0;
    const response = await route.GET(new Request("https://example.test/invoice"), {
        params: Promise.resolve({ orderId: "order-a" }),
    });
    assert.equal(response.status, 500);
    assert.equal(disconnected, 1);
    console.log("Invoice data checks passed (10 financial/output scenarios).");
})().catch(error => { console.error(error); process.exitCode = 1; });
