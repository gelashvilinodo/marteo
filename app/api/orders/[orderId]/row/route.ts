import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderPgReadContext } from "@/lib/orders/order-pg-read-context";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
    return withOrderPgReadContext(async (client, businessId) => {
        const { orderId } = await context.params;
        const params = Object.fromEntries(new URL(request.url).searchParams.entries());
        const data = await getOrdersPgPage(client, businessId, params, orderId);
        return orderJson({ success: true, order: data.orders[0] ?? null,
            summary: { counts: data.counts, invoiceCounts: data.invoiceCounts,
                totalOrders: data.totalOrders, currentPage: data.currentPage, totalPages: data.totalPages },
        });
    });
}
