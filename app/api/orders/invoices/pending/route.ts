import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/validate-order";

export async function GET(request: Request) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        const user = await getCurrentUser();
        if (!user) throw new OrderValidationError("გაიარე ავტორიზაცია.", 401);
        const params = new URL(request.url).searchParams;
        const snapshot = params.get("snapshot") ? new Date(params.get("snapshot")!) : new Date();
        if (!Number.isFinite(snapshot.getTime())) throw new OrderValidationError("ბეჭდვის რიგის თარიღი არასწორია.");
        const onlyNew = params.get("mode") === "new";
        let cursor: { id: string; createdAt: Date } | undefined;
        if (params.has("cursor")) {
            try {
                const parsed = JSON.parse(params.get("cursor")!) as { id?: unknown; createdAt?: unknown };
                if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") throw new Error();
                cursor = { id: parsed.id, createdAt: new Date(parsed.createdAt) };
                if (!Number.isFinite(cursor.createdAt.getTime())) throw new Error();
            } catch { throw new OrderValidationError("ბეჭდვის რიგის კურსორი არასწორია."); }
        }
        prisma = createPrismaClient();
        const membership = await prisma.businessMembership.findFirst({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { businessId: "asc" }], select: { businessId: true } });
        if (!membership) throw new OrderValidationError("ბიზნესი ვერ მოიძებნა.", 403);
        const pending = onlyNew ? Prisma.sql`"lastPrintedInvoiceVersion" IS NULL` : Prisma.sql`("lastPrintedInvoiceVersion" IS NULL OR "lastPrintedInvoiceVersion" <> "invoiceVersion")`;
        const after = cursor ? Prisma.sql`AND ("createdAt", "id") > (${cursor.createdAt}, ${cursor.id})` : Prisma.empty;
        // 50 მხოლოდ გადაცემის გვერდის ზომაა; შემდეგი კურსორით რიგი ბოლომდე იკითხება.
        const rows = await prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>(Prisma.sql`
            SELECT "id", "createdAt" FROM "Order"
            WHERE "businessId"=${membership.businessId} AND "deletedAt" IS NULL
              AND "status" <> 'CANCELED' AND "createdAt" <= ${snapshot} AND ${pending} ${after}
            ORDER BY "createdAt", "id" LIMIT 51
        `);
        const entries = rows.slice(0, 50);
        const last = entries.at(-1);
        return orderJson({ success: true, ids: entries.map(entry => entry.id), snapshot: snapshot.toISOString(),
            cursor: rows.length > 50 && last ? JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() }) : null });
    } catch (cause: unknown) { return orderError(cause); }
    finally { if (prisma) await prisma.$disconnect(); }
}
