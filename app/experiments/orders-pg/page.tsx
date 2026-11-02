import { requirePageAccess } from "@/lib/business/access";
import { hideCostsIfNeeded } from "@/lib/business/redact-costs";
import type { BusinessMode } from "@/lib/business/business-mode";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createPgReader } from "@/lib/database/pg-reader";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { getOrdersPgPage } from "@/lib/orders/get-orders-pg-page";
import type { OrdersSearchParams } from "@/lib/orders/get-orders-page";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrdersView from "@/components/dashboard/orders/OrdersView";

type Context = { mode:BusinessMode; expiresAt: Date; status: string; firstName: string | null; email: string; businessId: string | null; name: string; logoUrl: string | null };
export default async function OrdersPgExperiment({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
    const { access } = await requirePageAccess("ORDERS");
    const cookieStore = await cookies();
    const token = cookieStore.get("marteo_session")?.value;
    const preferred = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value ?? "";
    if (!token) redirect("/login");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = createPgReader();
    try {
        const [context] = await client.$queryRaw<Context[]>`
            SELECT s."expiresAt", u.status::text AS status, u."firstName", u.email, m."businessId", b.name, b."logoUrl", b.mode
            FROM "Session" s JOIN "User" u ON u.id = s."userId"
            LEFT JOIN LATERAL (SELECT "businessId" FROM "BusinessMembership" WHERE "userId" = u.id AND "status" = 'ACTIVE' ORDER BY ("businessId" = ${preferred}) DESC, "createdAt" ASC, "businessId" ASC LIMIT 1) m ON true
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
        return <DashboardShell businessMode={context.mode} businessName={context.name} businessLogoUrl={context.logoUrl} businessId={context.businessId} businesses={[]} userName={context.firstName || ""} userEmail={context.email} isOwner={access.role === "OWNER"} access={access}>
            <OrdersView data={await hideCostsIfNeeded(data)} basePath="/experiments/orders-pg" listEndpoint="/api/orders/list-pg" />
        </DashboardShell>;
    } finally { await client.$disconnect(); }
}
