import { apiAccessDenied } from "@/lib/business/access";
import { orderJson } from "@/lib/orders/order-http";
import { guardMutation } from "@/lib/security/mutation-request";
import {
    PurchasePlanError,
    readPlanQuantity,
    removePurchasePlanItems,
    updatePurchasePlanItem,
} from "@/lib/purchases/purchase-plan";
import { withPurchasePlan } from "@/lib/purchases/purchase-plan-http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
    const accessDenied = await apiAccessDenied(["PURCHASES", "INVENTORY"], "edit"); if (accessDenied) return accessDenied;
    const { id } = await params;

    return guardMutation(async (guarded) => {
        const body = await guarded.json().catch(() => null) as Record<string, unknown> | null;

        return withPurchasePlan(async (prisma, businessId) => {
            await updatePurchasePlanItem(prisma, businessId, id, readPlanQuantity(body?.quantity));
            return orderJson({ success: true });
        });
    })(request);
}

export async function DELETE(request: Request, { params }: Context) {
    const accessDenied = await apiAccessDenied(["PURCHASES", "INVENTORY"], "edit"); if (accessDenied) return accessDenied;
    const { id } = await params;

    return guardMutation(async () => withPurchasePlan(async (prisma, businessId) => {
        const removed = await removePurchasePlanItems(prisma, businessId, [id]);
        if (removed === 0) throw new PurchasePlanError("ჩანაწერი ვერ მოიძებნა.", 404);
        return orderJson({ success: true });
    }), "empty")(request);
}
