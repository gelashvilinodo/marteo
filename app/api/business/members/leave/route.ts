import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { leaveBusiness } from "@/lib/business/team-manage";
import { TeamError } from "@/lib/business/team-server";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

// ბიზნესის დატოვება საკუთარი ნებით; ერთადერთ მფლობელს ეს არ შეუძლია.
async function post() {
    const accessDenied = await apiAccessDenied("MEMBER", "view"); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const db = createPrismaClient();
    try {
        await leaveBusiness(db, context.membership!.businessId, context.user.id);
        const response = NextResponse.json({ success: true, redirectTo: "/dashboard" });
        response.cookies.delete(ACTIVE_BUSINESS_COOKIE);
        return response;
    } catch (error) {
        if (error instanceof TeamError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
        console.error("Leave business failed", error instanceof Error ? error.message : "UnknownError");
        return NextResponse.json({ success: false, message: "ბიზნესის დატოვება ვერ მოხერხდა. სცადე ხელახლა." }, { status: 500 });
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "empty");
