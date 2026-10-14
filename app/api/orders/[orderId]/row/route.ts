import { getOrdersPage } from "@/lib/orders/get-orders-page";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderReadContext } from "@/lib/orders/order-read-context";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
    return withOrderReadContext(async (client, businessId) => {
        const { orderId } = await context.params;
        const params = Object.fromEntries(new URL(request.url).searchParams.entries());
        const data = await getOrdersPage(client, businessId, params, orderId);
        return orderJson({ success: true, order: data.orders[0] ?? null,
            summary: { counts: data.counts, invoiceCounts: data.invoiceCounts,
                totalOrders: data.totalOrders, currentPage: data.currentPage, totalPages: data.totalPages },
        });
    });
}
