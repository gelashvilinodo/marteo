import { getOrdersPage } from "@/lib/orders/get-orders-page";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderReadContext } from "@/lib/orders/order-read-context";

export async function GET(request: Request) {
    return withOrderReadContext(async (client, businessId) => {
        const params = Object.fromEntries(new URL(request.url).searchParams.entries());
        const data = await getOrdersPage(client, businessId, params);
        return orderJson({ success: true, data });
    });
}
