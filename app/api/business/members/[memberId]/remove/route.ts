import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { requestRemoval } from "@/lib/business/team-manage";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ memberId: string }> };

export async function POST(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { memberId } = await context.params;
    return guardMutation(() => withTeam(async (db, businessId, userId) => {
        const done = await requestRemoval(db, businessId, userId, memberId);
        return done ? "წევრი გუნდიდან გავიდა." : "მოთხოვნა გაეგზავნა დანარჩენ მფლობელებს.";
    }), "empty")(request);
}
