import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { requestDeletion } from "@/lib/business/team-manage";
import { TeamError } from "@/lib/business/team-server";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";

// წაშლა იწყება სახელით და პაროლით; სხვა მფლობელების თანხმობამდე არაფერი იშლება.
async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const db = createPrismaClient();
    try {
        await reserveLimits(db, [{ scope: "business-delete", identity: context.user.id, maximum: 5, seconds: 600 }]);
        const deleted = await requestDeletion(db, context.membership!.businessId, context.user.id, body);
        const response = NextResponse.json({
            success: true, deleted,
            message: deleted ? "ბიზნესი წაიშალა." : "მოთხოვნა გაეგზავნა დანარჩენ მფლობელებს. ბიზნესი წაიშლება, როცა ყველა დაეთანხმება.",
        });
        if (deleted) response.cookies.delete(ACTIVE_BUSINESS_COOKIE);
        return response;
    } catch (error) {
        if (error instanceof TeamError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Business delete failed", error instanceof Error ? error.message : "UnknownError");
        return NextResponse.json({ success: false, message: "ბიზნესის წაშლა ვერ მოხერხდა. სცადეთ ხელახლა." }, { status: 500 });
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
