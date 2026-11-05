import "server-only";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { getTeamSnapshot, TeamError } from "./team-server";
import { enforceTeamLimitsFor } from "./team-manage";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// გუნდის როუტების საერთო გარსი. წვდომას თავად როუტი ამოწმებს apiAccessDenied-ით;
// აქ მხოლოდ აქტიური ბიზნესი იკითხება და პასუხად განახლებული გუნდი ბრუნდება.
export async function withTeam(action: (db: ReturnType<typeof createPrismaClient>, businessId: string, userId: string) => Promise<string | void>) {
    const context = await getPgDashboardContext();
    if (!context?.membership) return json({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
    const { businessId } = context.membership;
    const db = createPrismaClient();
    try {
        const notice = await action(db, businessId, context.user.id);
        await enforceTeamLimitsFor(db, [businessId]);
        return json({ success: true, message: notice ?? "", team: await getTeamSnapshot(db, businessId, context.user.id) });
    } catch (error) {
        if (error instanceof TeamError) return json({ success: false, message: error.message, field: error.field }, error.status);
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Team request failed", error instanceof Error ? error.message : "UnknownError");
        return json({ success: false, message: "მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
