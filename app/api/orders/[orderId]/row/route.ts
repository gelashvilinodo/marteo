import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getOrdersPage } from "@/lib/orders/get-orders-page";
import { orderJson, orderError } from "@/lib/orders/order-http";

export async function GET(
    request: Request,
    context: { params: Promise<{ orderId: string }> },
) {
    try {
        if (!(await getCurrentUser())) {
            return orderJson(
                { success: false, message: "გაიარე ავტორიზაცია." },
                401,
            );
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return orderJson(
                { success: false, message: "ბიზნესი ვერ მოიძებნა." },
                403,
            );
        }

        const { orderId } = await context.params;
        const search = new URL(request.url).searchParams;
        const params = Object.fromEntries(search.entries());
        const prisma = createPrismaClient();

        try {
            const data = await getOrdersPage(
                prisma,
                membership.businessId,
                params,
                orderId,
            );

            return orderJson({
                success: true,
                order: data.orders[0] ?? null,
                summary: {
                    counts: data.counts,
                    invoiceCounts: data.invoiceCounts,
                    totalOrders: data.totalOrders,
                    currentPage: data.currentPage,
                    totalPages: data.totalPages,
                },
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return orderError(cause);
    }
}