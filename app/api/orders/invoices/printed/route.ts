import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { findActiveMembership } from "@/lib/auth/active-business";

// Marks many invoices as printed in one request: one auth check, one DB
// connection, one transaction. Each invoice still keeps its own version check.
const MAX_ITEMS = 100;

function json(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

type Item = { id: string; version: number };

function parseItems(data: unknown): Item[] | null {
    const items = data && typeof data === "object" && "items" in data ? data.items : undefined;
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) return null;
    const seen = new Set<string>();
    const result: Item[] = [];
    for (const item of items) {
        if (!item || typeof item !== "object") return null;
        const { id, version } = item as { id?: unknown; version?: unknown };
        if (typeof id !== "string" || !id.trim() || id.length > 200) return null;
        if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) return null;
        if (seen.has(id)) continue;
        seen.add(id);
        result.push({ id, version });
    }
    return result;
}

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        if (request.headers.get("origin") !== new URL(request.url).origin) {
            return json({ success: false, message: "მოთხოვნის წყარო დაუშვებელია." }, 403);
        }
        const user = await getCurrentUser();
        if (!user) return json({ success: false, message: "გაიარეთ ავტორიზაცია." }, 401);
        let data: unknown;
        try { data = await request.json(); }
        catch { return json({ success: false, message: "მონაცემების ფორმატი არასწორია." }, 400); }
        const items = parseItems(data);
        if (!items) return json({ success: false, message: `ერთ მოთხოვნაში აირჩიეთ 1-დან ${MAX_ITEMS}-მდე ინვოისი.` }, 422);

        prisma = createPrismaClient();
        const membership = await findActiveMembership(prisma, user.id);
        if (!membership) return json({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);

        const printedAt = new Date();
        const db = prisma;
        const results = await db.$transaction(items.map(({ id, version }) => db.order.updateMany({
            where: { id, businessId: membership.businessId, deletedAt: null, invoiceVersion: version },
            data: { lastPrintedInvoiceVersion: version, invoicePrintedAt: printedAt },
        })));

        const confirmed: string[] = [];
        const failedIds: string[] = [];
        items.forEach((item, index) => (results[index].count ? confirmed : failedIds).push(item.id));

        let changed: string[] = [];
        let missing: string[] = [];
        if (failedIds.length) {
            const existing = await db.order.findMany({
                where: { id: { in: failedIds }, businessId: membership.businessId, deletedAt: null },
                select: { id: true },
            });
            const existingIds = new Set(existing.map(order => order.id));
            changed = failedIds.filter(id => existingIds.has(id));
            missing = failedIds.filter(id => !existingIds.has(id));
        }

        return costSafeJson({ success: true, printedAt: printedAt.toISOString(), confirmed, changed, missing });
    } catch (cause: unknown) {
        console.error("Batch invoice print confirmation failed", cause instanceof Error ? cause.name : "UnknownError");
        return json({ success: false, message: "დაბეჭდვის მონიშვნა ვერ მოხერხდა. სცადეთ ხელახლა." }, 500);
    } finally { if (prisma) await prisma.$disconnect(); }
}
