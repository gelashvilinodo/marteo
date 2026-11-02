import { hideCostsIfNeeded } from "@/lib/business/redact-costs";
import { requireDashboardSection } from "@/lib/business/access";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createPgReader } from "@/lib/database/pg-reader";
import type { OrdersSearchParams } from "@/lib/orders/get-orders-page";
import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import OrdersView from "@/components/dashboard/orders/OrdersView";
import { getCurrentBusiness } from "@/lib/auth/current-business";

export default async function OrdersPage({ searchParams }: {
    searchParams: Promise<OrdersSearchParams>;
}) {
    await requireDashboardSection("/dashboard/orders");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const membership = await getCurrentBusiness();

    if (!membership) {
        redirect("/business/onboarding");
    }
    const client = createPgReader();
    try {
        const data = await getOrdersPgPage(client, membership.businessId, await searchParams);
        return <OrdersView data={await hideCostsIfNeeded(data)} />;
    } finally {
        await client.$disconnect();
    }
}
