import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { sql, empty } from "@prisma/client-runtime-utils";
import { cookies } from "next/headers";
import { withInvoiceReader } from "@/lib/orders/read-invoice-order";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/order-validation-error";
import { NEW_INVOICE_SQL, UPDATED_INVOICE_SQL, resolveOrdersView } from "@/lib/orders/orders-view-filter";

export async function GET(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "view"); if (accessDenied) return accessDenied;
    try {
        const token = (await cookies()).get("marteo_session")?.value;
        return await withInvoiceReader(token, async (reader, businessId) => {
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
            // scope=view: მხოლოდ შეკვეთების გვერდზე გაფილტრული შეკვეთები (პერიოდი, სტატუსი, გადახდა, ძებნა).
            const view = params.get("scope") === "view"
                ? (await resolveOrdersView(reader, businessId, Object.fromEntries(params.entries()))).where
                : sql`o."businessId"=${businessId} AND o."deletedAt" IS NULL`;
            const pending = onlyNew ? NEW_INVOICE_SQL : sql`((${NEW_INVOICE_SQL}) OR (${UPDATED_INVOICE_SQL}))`;
            const after = cursor ? sql`AND (o."createdAt", o."id") > (${cursor.createdAt}, ${cursor.id})` : empty;
            // 50 მხოლოდ გადაცემის გვერდის ზომაა; შემდეგი კურსორით რიგი ბოლომდე იკითხება.
            const rows = await reader.$queryRaw<Array<{ id: string; createdAt: Date }>>(sql`
                SELECT o."id", o."createdAt" FROM "Order" o
                WHERE ${view} AND o."createdAt" <= ${snapshot} AND ${pending} ${after}
                ORDER BY o."createdAt", o."id" LIMIT 51
            `);
            const entries = rows.slice(0, 50);
            const last = entries.at(-1);
            return costSafeJson({ success: true, ids: entries.map(entry => entry.id), snapshot: snapshot.toISOString(),
                cursor: rows.length > 50 && last ? JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() }) : null });
        });
    } catch (cause: unknown) { return orderError(cause); }
}
