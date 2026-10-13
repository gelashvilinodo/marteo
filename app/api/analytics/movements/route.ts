import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";
import { getFinancialMovements } from "@/lib/analytics/get-financial-movements";
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
        const params = {
            period: search.get("period") ?? "month",
            from: search.get("from") ?? "",
            to: search.get("to") ?? "",
            movement: search.get("movement") ?? "all",
            page: search.get("page") ?? "1",
        };

        const range = resolveOrdersPeriod(
            params.period,
            params.from,
            params.to,
        );

        const prisma = createPrismaClient();

        try {
            const data = await getFinancialMovements(
                prisma,
                membership.businessId,
                range.from,
                range.to,
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