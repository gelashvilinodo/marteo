import type { BusinessMode } from "@/lib/business/business-mode";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createPgReader } from "@/lib/database/pg-reader";
import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import type { OrdersSearchParams } from "@/lib/orders/get-orders-page";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrdersView from "@/components/dashboard/orders/OrdersView";

type Context = { mode:BusinessMode; expiresAt: Date; status: string; firstName: string | null; email: string; businessId: string | null; name: string; logoUrl: string | null };
export default async function OrdersPgExperiment({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
    const token = (await cookies()).get("marteo_session")?.value;
    if (!token) redirect("/login");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = createPgReader();
    try {
        const [context] = await client.$queryRaw<Context[]>`
            SELECT s."expiresAt", u.status::text AS status, u."firstName", u.email, m."businessId", b.name, b."logoUrl", b.mode
            FROM "Session" s JOIN "User" u ON u.id = s."userId"
            LEFT JOIN LATERAL (SELECT "businessId" FROM "BusinessMembership" WHERE "userId" = u.id ORDER BY "createdAt" ASC LIMIT 1) m ON true
            LEFT JOIN "Business" b ON b.id = m."businessId"
            WHERE s."tokenHash" = ${tokenHash} LIMIT 1
        `;
        if (!context) redirect("/login");
        if (context.expiresAt <= new Date()) {
            await client.$queryRaw`DELETE FROM "Session" WHERE "tokenHash" = ${tokenHash}`;
            redirect("/login");
        }
        if (context.status !== "ACTIVE") redirect("/login");
        if (!context.businessId) redirect("/business/onboarding");
        const data = await getOrdersPgPage(client, context.businessId, await searchParams);
        return <DashboardShell businessMode={context.mode} businessName={context.name} businessLogoUrl={context.logoUrl} userName={context.firstName || ""} userEmail={context.email}>
            <OrdersView data={data} basePath="/experiments/orders-pg" listEndpoint="/api/orders/list-pg" />
        </DashboardShell>;
    } finally { await client.$disconnect(); }
}
