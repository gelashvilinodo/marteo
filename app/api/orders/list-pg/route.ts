import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderPgReadContext } from "@/lib/orders/order-pg-read-context";

export async function GET(request: Request) {
    return withOrderPgReadContext(async (client, businessId) => {
        const params = Object.fromEntries(new URL(request.url).searchParams.entries());
        return orderJson({ success: true, data: await getOrdersPgPage(client, businessId, params) });
    });
}
