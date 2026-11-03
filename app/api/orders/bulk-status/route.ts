import { apiAccessDenied } from "@/lib/business/access";
import { bulkOrderStatus } from "@/lib/orders/bulk-order-status";
import { orderError, orderJson, readOrderBody } from "@/lib/orders/order-http";

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "edit"); if (accessDenied) return accessDenied;
    try {
        const body = await readOrderBody(request);
        return orderJson({ success: true, ...await bulkOrderStatus(body) });
    } catch (cause: unknown) { return orderError(cause); }
}
