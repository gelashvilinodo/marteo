import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { withTeam } from "@/lib/business/team-http";
import { voteOnRequest } from "@/lib/business/team-manage";
import { TeamError } from "@/lib/business/team-server";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { requestId } = await context.params;
    return guardMutation(async checked => {
        const body = ((await checked.json().catch(() => null)) ?? {}) as { approve?: unknown };
        const approve = body.approve === true;
        const member = (await getPgDashboardContext())?.membership;
        if (!member) return NextResponse.json({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, { status: 403 });
        // წაშლის ბოლო თანხმობისას ბიზნესი აღარ არსებობს, ამიტომ გუნდის სია აღარ ბრუნდება.
        const db = createPrismaClient();
        try {
            const probe = await db.businessConsentRequest.findFirst({ where: { id: requestId, businessId: member.businessId }, select: { kind: true } });
            if (probe?.kind === "DELETE_BUSINESS") {
                const { deleted } = await voteOnRequest(db, member.businessId, (await getPgDashboardContext())!.user.id, requestId, approve);
                const response = NextResponse.json({ success: true, deleted, message: deleted ? "ბიზნესი წაიშალა." : approve ? "თანხმობა მიღებულია." : "მოთხოვნა უარყოფილია." });
                if (deleted) response.cookies.delete(ACTIVE_BUSINESS_COOKIE);
                return response;
            }
        } catch (error) {
            if (error instanceof TeamError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
            throw error;
        } finally {
            await db.$disconnect();
        }
        return withTeam(async (db, businessId, userId) => {
            await voteOnRequest(db, businessId, userId, requestId, approve);
            return approve ? "თანხმობა მიღებულია." : "მოთხოვნა უარყოფილია.";
        });
    }, "json")(request);
}
