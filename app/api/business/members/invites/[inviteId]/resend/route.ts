import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { resendInvite } from "@/lib/business/team-server";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ inviteId: string }> };

export async function POST(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { inviteId } = await context.params;
    return guardMutation(() => withTeam(async (db, businessId) => {
        await resendInvite(db, businessId, inviteId);
        return "მოწვევა ხელახლა გაიგზავნა.";
    }), "empty")(request);
}
