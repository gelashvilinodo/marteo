import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { cancelPlan, downgradePlan, PlanActionError, resumePlan } from "@/lib/subscription/manage";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// მფლობელის ქმედებები გეგმაზე, რომლებსაც გადახდა არ სჭირდება: გაუქმება, გაგრძელება, დაბალ გეგმაზე გადასვლა.
async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const businessId = context.membership!.businessId;
    const body = await request.json().catch(() => null) as { action?: unknown; plan?: unknown; keep?: unknown; mode?: unknown } | null;
    const db = createPrismaClient();
    try {
        let message: string;
        if (body?.action === "cancel") message = await cancelPlan(db, context.user.id, businessId);
        else if (body?.action === "resume") message = await resumePlan(db, context.user.id, businessId);
        else if (body?.action === "downgrade") message = await downgradePlan(db, context.user.id, businessId, body.plan, { keep: body.keep, mode: body.mode });
        else return json({ success: false, message: "ქმედება არასწორია." }, 422);
        return json({ success: true, message });
    } catch (error) {
        if (error instanceof PlanActionError) return json({ success: false, message: error.message }, error.status);
        console.error("Plan change failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "გეგმა ვერ შეიცვალა. სცადე ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post);
