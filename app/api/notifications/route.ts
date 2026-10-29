import { guardMutation } from "@/lib/security/mutation-request";
import { deleteNotificationsRoute } from "@/lib/notifications/delete-route";

export const dynamic = "force-dynamic";

export const DELETE = guardMutation(() => deleteNotificationsRoute(null), "empty");
