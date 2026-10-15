import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getCustomersPage } from "@/lib/customers/get-customers-page";
import { orderJson } from "@/lib/orders/order-http";

export async function GET(request: Request) {
    try {
        if (!(await getCurrentUser())) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        const membership = await getCurrentBusiness();
        if (!membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        const prisma = createPrismaClient();
        try {
            const data = await getCustomersPage(prisma, membership.businessId, Object.fromEntries(new URL(request.url).searchParams));
            return orderJson({ success: true, data });
        } finally { await prisma.$disconnect(); }
    } catch (cause) {
        console.error("Customer list refresh failed", cause instanceof Error ? cause.name : "UnknownError");
        return orderJson({ success: false, message: "მომხმარებლების სია ვერ განახლდა. სცადე ხელახლა." }, 500);
    }
}
