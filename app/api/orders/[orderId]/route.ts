import { getOrder } from "@/lib/orders/get-order";
import { mutateOrder } from "@/lib/orders/order-mutations";
import { orderError, orderJson, readOrderBody } from "@/lib/orders/order-http";

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
    try {
        const body = await readOrderBody(request);
        const { orderId } = await context.params;
        return orderJson({ success: true, order: await mutateOrder(orderId, "edit", body) });
    } catch (cause: unknown) { return orderError(cause); }
}

export async function DELETE(request: Request, context: { params: Promise<{ orderId: string }> }) {
    try {
        const body = await readOrderBody(request);
        const { orderId } = await context.params;
        return orderJson({ success: true, order: await mutateOrder(orderId, "delete", body) });
    } catch (cause: unknown) { return orderError(cause); }
}

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
    try { const { orderId } = await context.params; return orderJson({ success: true, order: await getOrder(orderId) }); }
    catch (cause: unknown) { return orderError(cause); }
}
