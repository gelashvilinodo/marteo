import { apiAccessDenied } from "@/lib/business/access";
import { withTeam } from "@/lib/business/team-http";

export async function GET() {
    const accessDenied = await apiAccessDenied("OWNER", "view"); if (accessDenied) return accessDenied;
    return withTeam(async () => {});
}
