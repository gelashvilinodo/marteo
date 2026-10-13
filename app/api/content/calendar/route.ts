import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getCalendarPage } from "@/lib/content/get-calendar-page";
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

        const params = Object.fromEntries(
            new URL(request.url).searchParams.entries(),
        );

        const prisma = createPrismaClient();

        try {
            const data = await prisma.$transaction(
                tx => getCalendarPage(tx, membership.businessId, params),
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.RepeatableRead,
                    maxWait: 10000,
                    timeout: 15000,
                },
            );

            return orderJson({ success: true, data });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return orderError(cause);
    }
}