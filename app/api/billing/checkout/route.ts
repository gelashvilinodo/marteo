import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { startCheckout } from "@/lib/subscription/bank";
import { PlanActionError } from "@/lib/subscription/manage";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// ბარათით გადახდის დაწყება: აბრუნებს ბანკის გადახდის გვერდის მისამართს.
// დაბლოკილი ბიზნესიც იხდის (allowLocked).
async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const body = await request.json().catch(() => null) as { plan?: unknown } | null;
    const db = createPrismaClient();
    try {
        const redirectUrl = await startCheckout(db, context.user.id, context.membership!.businessId, typeof body?.plan === "string" ? body.plan.toUpperCase() : null);
        return json({ success: true, redirectUrl });
    } catch (error) {
        if (error instanceof PlanActionError) return json({ success: false, message: error.message }, error.status);
        console.error("Checkout failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "გადახდა ვერ დაიწყო. სცადეთ ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post);
