import { apiAccessDenied } from "@/lib/business/access";
import { orderJson } from "@/lib/orders/order-http";
import { guardMutation } from "@/lib/security/mutation-request";
import {
    addToPurchasePlan,
    countPurchasePlan,
    getPurchasePlan,
    PurchasePlanError,
    readPlanQuantity,
} from "@/lib/purchases/purchase-plan";
import { withPurchasePlan } from "@/lib/purchases/purchase-plan-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const accessDenied = await apiAccessDenied(["PURCHASES", "INVENTORY"], "view"); if (accessDenied) return accessDenied;
    const countOnly = new URL(request.url).searchParams.get("count") === "1";

    return withPurchasePlan(
        async (prisma, businessId) => countOnly
            ? orderJson({ success: true, count: await countPurchasePlan(prisma, businessId) })
            : orderJson({ success: true, items: await getPurchasePlan(prisma, businessId) }),
        () => orderJson({ success: true, unavailable: true, count: 0, items: [] }),
    );
}

export const POST = guardMutation(async (request) => {
    const accessDenied = await apiAccessDenied(["PURCHASES", "INVENTORY"], "edit"); if (accessDenied) return accessDenied;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    return withPurchasePlan(async (prisma, businessId) => {
        if (!body || typeof body.inventoryItemId !== "string" || !body.inventoryItemId) {
            throw new PurchasePlanError("პროდუქტი არ არის არჩეული.");
        }

        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;
        const item = await addToPurchasePlan(prisma, businessId, {
            inventoryItemId: body.inventoryItemId,
            quantity: readPlanQuantity(body.quantity),
            reason,
            source: body.source === "AI" ? "AI" : "MANUAL",
        });

        return orderJson({ success: true, id: item.id });
    });
});
