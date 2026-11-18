import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { startSmsPackCheckout } from "@/lib/subscription/bank";
import { PlanActionError } from "@/lib/subscription/manage";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// SMS პაკეტის ყიდვა ბარათით: აბრუნებს ბანკის გადახდის გვერდის მისამართს.
// მხოლოდ მფლობელი და იმ გეგმაზე, რომელშიც SMS შედის.
async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit", { feature: "sms" }); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const body = await request.json().catch(() => null) as { count?: unknown } | null;
    const db = createPrismaClient();
    try {
        const redirectUrl = await startSmsPackCheckout(db, context.user.id, context.membership!.businessId, body?.count);
        return json({ success: true, redirectUrl });
    } catch (error) {
        if (error instanceof PlanActionError) return json({ success: false, message: error.message }, error.status);
        console.error("SMS pack checkout failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "გადახდა ვერ დაიწყო. სცადეთ ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post);
