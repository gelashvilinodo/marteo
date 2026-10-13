import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getOrdersPage } from "@/lib/orders/get-orders-page";
import { orderJson, orderError } from "@/lib/orders/order-http";

export async function GET(request: Request) {
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

        const search = new URL(request.url).searchParams;
        const params = Object.fromEntries(search.entries());
        const prisma = createPrismaClient();

        try {
            const data = await getOrdersPage(
                prisma,
                membership.businessId,
                params,
            );

            return orderJson({ success: true, data });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return orderError(cause);
    }
}