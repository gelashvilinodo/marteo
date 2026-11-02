import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderPgReadContext } from "@/lib/orders/order-pg-read-context";

export async function GET(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "view"); if (accessDenied) return accessDenied;
    return withOrderPgReadContext(async (client, businessId) => {
        const params = Object.fromEntries(new URL(request.url).searchParams.entries());
        const data = await getOrdersPgPage(client, businessId, params);
        return costSafeJson({ success: true, data });
    });
}
