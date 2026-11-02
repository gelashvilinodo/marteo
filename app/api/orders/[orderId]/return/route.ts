import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { mutateOrder } from "@/lib/orders/order-mutations";
import { orderError, orderJson, readOrderBody } from "@/lib/orders/order-http";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
    const accessDenied = await apiAccessDenied("ORDERS", "edit"); if (accessDenied) return accessDenied;
    try {
        const body = await readOrderBody(request);
        const { orderId } = await context.params;
        return costSafeJson({ success: true, order: await mutateOrder(orderId, "return", body) });
    } catch (cause: unknown) { return orderError(cause); }
}
