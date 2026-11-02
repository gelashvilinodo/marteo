import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";
import { createInvite, readInviteInput } from "@/lib/business/team-server";
import { guardMutation } from "@/lib/security/mutation-request";

async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const body = await request.json().catch(() => null);
    return withTeam(async (db, businessId, userId) => {
        const input = readInviteInput(body);
        await createInvite(db, businessId, userId, input);
        return "მოთხოვნა გაიგზავნა.";
    });
}
export const POST = guardMutation(post, "json");
