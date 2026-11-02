import { apiAccessDenied } from "@/lib/business/access";
import { guardMutation } from "@/lib/security/mutation-request";
import { deleteNotificationsRoute } from "@/lib/notifications/delete-route";

export const dynamic = "force-dynamic";

export const DELETE = guardMutation(async () => {
    const accessDenied = await apiAccessDenied("MEMBER", "view"); if (accessDenied) return accessDenied;
    return deleteNotificationsRoute(null);
}, "empty");
