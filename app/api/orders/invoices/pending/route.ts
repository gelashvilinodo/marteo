import { sql, empty } from "@prisma/client-runtime-utils";
import { cookies } from "next/headers";
import { withInvoiceReader } from "@/lib/orders/read-invoice-order";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/order-validation-error";

export async function GET(request: Request) {
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
            const pending = onlyNew ? sql`"lastPrintedInvoiceVersion" IS NULL` : sql`("lastPrintedInvoiceVersion" IS NULL OR "lastPrintedInvoiceVersion" <> "invoiceVersion")`;
            const after = cursor ? sql`AND ("createdAt", "id") > (${cursor.createdAt}, ${cursor.id})` : empty;
            // 50 მხოლოდ გადაცემის გვერდის ზომაა; შემდეგი კურსორით რიგი ბოლომდე იკითხება.
            const rows = await reader.$queryRaw<Array<{ id: string; createdAt: Date }>>(sql`
                SELECT "id", "createdAt" FROM "Order"
                WHERE "businessId"=${businessId} AND "deletedAt" IS NULL
                  AND "status" <> 'CANCELED' AND "createdAt" <= ${snapshot} AND ${pending} ${after}
                ORDER BY "createdAt", "id" LIMIT 51
            `);
            const entries = rows.slice(0, 50);
            const last = entries.at(-1);
            return orderJson({ success: true, ids: entries.map(entry => entry.id), snapshot: snapshot.toISOString(),
                cursor: rows.length > 50 && last ? JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() }) : null });
        });
    } catch (cause: unknown) { return orderError(cause); }
}
