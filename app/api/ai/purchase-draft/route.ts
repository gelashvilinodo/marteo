import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { businessFeatureMessage, hasBusinessFeature } from "@/lib/business/business-mode";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";
import { finishAiUsage, startAiUsage, type AiUsageReservation } from "@/lib/ai/ai-usage";
import { AiChatError } from "@/lib/ai/marteo-ai-chat";
import { createPurchaseDraft } from "@/lib/ai/purchase-draft";
import type { AiSourceRow } from "@/lib/ai/purchase-draft-types";

const MAX_ROWS = 400;
const MAX_CELLS = 30;

function readRows(value: unknown): AiSourceRow[] | null {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROWS) return null;

    const rows: AiSourceRow[] = [];
    for (const entry of value) {
        const { row, cells } = (entry ?? {}) as { row?: unknown; cells?: unknown };
        if (!Number.isSafeInteger(row) || Number(row) < 1) return null;
        if (!Array.isArray(cells) || cells.length > MAX_CELLS) return null;
        if (!cells.every((cell) => typeof cell === "string" && cell.length <= 300)) return null;
        rows.push({ row: Number(row), cells: cells as string[] });
    }

    return rows;
}

export const POST = guardMutation(async (request) => {
    const accessDenied = await apiAccessDenied("PURCHASES", "edit", { feature: "aiFiles" }); if (accessDenied) return accessDenied;
    const context = await getPgDashboardContext();

    if (!context) {
        return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
    }

    if (!context.membership) {
        return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
    }

    const body = await request.json() as Record<string, unknown>;
    const target = body.target === "materials" ? "materials" : body.target === "products" ? "products" : null;
    const rows = readRows(body.rows);
    const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "";
    const photoCount = Number.isSafeInteger(body.photoCount) && Number(body.photoCount) >= 0 ? Number(body.photoCount) : 0;

    if (!target || !rows || !fileName) {
        return orderJson({ success: false, message: "ფაილის მონაცემები არასწორია." }, 400);
    }

    const feature = target === "products" ? "imports" : "manufacturing";
    if (!hasBusinessFeature(context.membership.business.mode, feature)) {
        return orderJson({ success: false, message: businessFeatureMessage(feature) }, 403);
    }

    const prisma = createPrismaClient();
    let usage: AiUsageReservation | null = null;
    let failed = true;

    try {
        const businessId = context.membership.businessId;

        await reserveLimits(prisma, [
            { scope: "ai-purchase-burst", identity: businessId, maximum: 5, seconds: 10 * 60 },
        ]);
        // ფაილიდან შესყიდვა თვიურ ლიმიტში ერთ კითხვად ითვლება.
        usage = await startAiUsage(prisma, { businessId, businessName: context.membership.business.name, userId: context.user.id, kind: "PURCHASE_DRAFT" });

        const draft = await createPurchaseDraft({ prisma, businessId, target, fileName, rows, photoCount, meter: usage.meter });
        failed = false;
        return orderJson({ success: true, draft, quota: usage.quota });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;

        if (error instanceof AiChatError) {
            return orderJson({ success: false, message: error.message }, error.status);
        }

        console.error("Marteo AI purchase draft failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "ფაილის დამუშავება ვერ მოხერხდა. სცადე ხელახლა." }, 500);
    } finally {
        if (usage) await finishAiUsage(prisma, usage, failed);
        await prisma.$disconnect();
    }
});
