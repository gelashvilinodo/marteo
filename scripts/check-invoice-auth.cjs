// Isolated checks: no real cookies, credentials or database writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const { Decimal } = require("@prisma/client-runtime-utils");

const root = path.resolve(__dirname, "..");
let cookie;
let session;
let membership;
let queryError;
let calls;

function reset() {
  cookie = "isolated-test-token";
  session = {
    expiresAt: new Date(Date.now() + 60000),
    user: { id: "user-a", status: "ACTIVE" },
  };
  membership = { businessId: "business-a" };
  queryError = false;
  calls = { clients: 0, disconnects: 0, queries: 0, deletes: 0, orders: [] };
}

function createPrismaClient() {
  calls.clients++;
  return {
    session: {
      async findUnique(args) {
        calls.queries++;
        assert.equal(args.where.tokenHash,
          crypto.createHash("sha256").update(cookie).digest("hex"));
        if (queryError) throw new Error("isolated-query-failure");
        return session;
      },
      async deleteMany(args) {
        calls.deletes++;
        assert.equal(args.where.tokenHash,
          crypto.createHash("sha256").update(cookie).digest("hex"));
      },
    },
    businessMembership: { async findFirst(args) {
      assert.equal(args.where.userId, "user-a");
      return membership;
    } },
    async $queryRaw(strings, orderId, businessId) {
      calls.orders.push({ id: orderId, businessId, deletedAt: null });
      assert.ok(strings.join("?").includes('o."businessId" = ?'));
      assert.ok(strings.join("?").includes('o."deletedAt" IS NULL'));
      // A nonexistent or another tenant's order is not returned.
      return [];
    },
    async $disconnect() { calls.disconnects++; },
  };
}

function load(relative, imports) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require(name) {
      if (name === "@prisma/client-runtime-utils") return require("@prisma/client-runtime-utils");
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    Response, URL, Date, Map, performance,
    console: { info() {}, error() {} },
  }, { filename: relative });
  return exports;
}

const auth = load("lib/auth/session.ts", {
  crypto,
  "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
  react: { cache: fn => fn }, // Scope caching itself is outside these checks.
  "@/lib/prisma": { createPrismaClient },
});
const route = load("app/api/orders/[orderId]/invoice/route.ts", {
  "@/generated/prisma/client": { Prisma: {} },
  "@/lib/orders/order-payable-total": { orderPayableTotal() {
    throw new Error("Unauthorized request reached financial calculations");
  } },
  "@/lib/auth/session": auth,
  "@/lib/prisma": { createPrismaClient },
  "@/lib/orders/get-invoice-order": load("lib/orders/get-invoice-order.ts", {
    "@/generated/prisma/client": { Prisma: { Decimal } },
  }),
});

async function getInvoice() {
  return route.GET(new Request("https://example.test/api/orders/other-order/invoice"),
    { params: Promise.resolve({ orderId: "other-order" }) });
}

(async () => {
  reset(); cookie = undefined;
  assert.equal(await auth.getCurrentUser(), null);
  assert.equal(calls.clients, 0);

  reset();
  assert.equal((await auth.getCurrentUser()).id, "user-a");
  assert.equal(calls.disconnects, 1);

  reset(); queryError = true;
  await assert.rejects(auth.getCurrentUser(), /isolated-query-failure/);
  assert.equal(calls.disconnects, 1);

  reset(); cookie = undefined;
  assert.equal((await getInvoice()).status, 401);
  assert.equal(calls.clients, 0);

  for (const kind of ["missing", "expired", "inactive"]) {
    reset();
    if (kind === "missing") session = null;
    if (kind === "expired") session.expiresAt = new Date(0);
    if (kind === "inactive") session.user.status = "PENDING";
    assert.equal((await getInvoice()).status, 401);
    assert.equal(calls.clients, 1);
    assert.equal(calls.disconnects, 1);
    assert.equal(calls.orders.length, 0);
    assert.equal(calls.deletes, kind === "expired" ? 1 : 0);
  }

  reset(); membership = null;
  assert.equal((await getInvoice()).status, 403);
  assert.equal(calls.orders.length, 0);
  assert.equal(calls.clients, 1);
  assert.equal(calls.disconnects, 1);

  reset();
  assert.equal((await getInvoice()).status, 404);
  assert.equal(calls.clients, 1);
  assert.equal(calls.disconnects, 1);
  assert.equal(calls.orders[0].id, "other-order");
  assert.equal(calls.orders[0].businessId, "business-a");
  assert.equal(calls.orders[0].deletedAt, null);

  reset(); queryError = true;
  assert.equal((await getInvoice()).status, 500);
  assert.equal(calls.disconnects, 1);

  console.log("Invoice auth/lifecycle checks passed (10 scenarios).");
})().catch(error => { console.error(error); process.exitCode = 1; });
