import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { updateStaffAccess } from "@/lib/business/team-manage";
import { guardMutation } from "@/lib/security/mutation-request";

type RouteContext = { params: Promise<{ memberId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { memberId } = await context.params;
    return guardMutation(async checked => {
        const body = ((await checked.json().catch(() => null)) ?? {}) as Record<string, unknown>;
        return withTeam(async (db, businessId, userId) => {
            await updateStaffAccess(db, businessId, userId, memberId, body);
            return "უფლებები განახლდა.";
        });
    }, "json")(request);
}
