import { apiAccessDenied } from "@/lib/business/access";
import { deleteSettledOrders } from "@/lib/orders/delete-settled-orders";
import { orderError, orderJson, readOrderBody } from "@/lib/orders/order-http";

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "edit"); if (accessDenied) return accessDenied;
    try {
        const body = await readOrderBody(request);
        return orderJson({ success: true, ...await deleteSettledOrders(body) });
    } catch (cause: unknown) { return orderError(cause); }
}
