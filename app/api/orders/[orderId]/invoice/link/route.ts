import { mutateOrder } from "@/lib/orders/order-mutations";
import { orderError, orderJson, readOrderBody } from "@/lib/orders/order-http";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
    try {
        const body = await readOrderBody(request);
        const { orderId } = await context.params;
        return orderJson({ success: true, order: await mutateOrder(orderId, "link", body) });
    } catch (cause: unknown) { return orderError(cause); }
}
