import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { getOrdersPage, type OrdersSearchParams } from "@/lib/orders/get-orders-page";
import OrdersView from "@/components/dashboard/orders/OrdersView";

export default async function OrdersPage({ searchParams }: {
    searchParams: Promise<OrdersSearchParams>;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const prisma = createPrismaClient();
    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });
        if (!membership) redirect("/business/onboarding");
        const data = await getOrdersPage(prisma, membership.businessId, await searchParams);
        return <OrdersView data={data} />;
    } finally {
        await prisma.$disconnect();
    }
}
