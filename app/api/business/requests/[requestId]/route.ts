import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { cancelRequest } from "@/lib/business/team-manage";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ requestId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    const { requestId } = await context.params;
    return guardMutation(() => withTeam(async (db, businessId, userId) => {
        await cancelRequest(db, businessId, userId, requestId);
        return "მოთხოვნა გაუქმდა.";
    }), "empty")(request);
}
