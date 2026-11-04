import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { getSmsUsage } from "@/lib/sms/order-sms";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// SMS მყიდველთან ჩართვა/გამორთვა. ნაყიდი ნაშთი გამორთვისას არ იკარგება.
async function patch(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit", { feature: "sms" }); if (accessDenied) return accessDenied;
    const businessId = (await getPgDashboardContext())!.membership!.businessId;
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") return json({ success: false, message: "მნიშვნელობა არასწორია." }, 422);
    const db = createPrismaClient();
    try {
        await db.business.update({ where: { id: businessId }, data: { smsEnabled: body.enabled } });
        return json({ success: true, sms: await getSmsUsage(db, businessId) });
    } catch (error) {
        console.error("SMS setting failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "პარამეტრი ვერ შეინახა. სცადე ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const PATCH = guardMutation(patch);
