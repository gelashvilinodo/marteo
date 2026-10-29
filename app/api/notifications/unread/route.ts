import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { getUnreadNotificationCount } from "@/lib/notifications/user-notifications";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
    try {
        const context = await getPgDashboardContext();
        if (!context) return json({ error: "გაიარე ავტორიზაცია." }, 401);
        return json({ unread: await getUnreadNotificationCount(context.user.id, context.membership?.businessId ?? null) });
    } catch (error) {
        console.error("Unread notifications failed", { type: error instanceof Error ? error.name : "unknown" });
        return json({ error: "შეტყობინებები ვერ ჩაიტვირთა." }, 500);
    }
}
