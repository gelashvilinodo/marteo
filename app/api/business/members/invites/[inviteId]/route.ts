import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { cancelInvite } from "@/lib/business/team-server";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ inviteId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { inviteId } = await context.params;
    return guardMutation(() => withTeam(async (db, businessId) => {
        await cancelInvite(db, businessId, inviteId);
        return "მოწვევა გაუქმდა.";
    }), "empty")(request);
}
