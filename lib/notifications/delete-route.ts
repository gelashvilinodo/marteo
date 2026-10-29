import "server-only";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { deleteNotifications } from "./user-notifications";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Shared by "delete one" (id) and "delete all" (null). */
export async function deleteNotificationsRoute(id: string | null) {
    try {
        const context = await getPgDashboardContext();
        if (!context) return json({ error: "გაიარე ავტორიზაცია." }, 401);
        await deleteNotifications(context.user.id, context.membership?.businessId ?? null, id);
        return json({ ok: true });
    } catch (error) {
        console.error("Delete notifications failed", { type: error instanceof Error ? error.name : "unknown" });
        return json({ error: "შეტყობინება ვერ წაიშალა." }, 500);
    }
}
