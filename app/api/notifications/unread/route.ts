import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { getUnreadNotificationCount } from "@/lib/notifications/user-notifications";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
    const accessDenied = await apiAccessDenied("MEMBER", "view"); if (accessDenied) return accessDenied;
    try {
        const context = await getPgDashboardContext();
        if (!context) return json({ error: "გაიარეთ ავტორიზაცია." }, 401);
        return json({ unread: await getUnreadNotificationCount(context.user.id, context.membership?.businessId ?? null) });
    } catch (error) {
        console.error("Unread notifications failed", { type: error instanceof Error ? error.name : "unknown" });
        return json({ error: "შეტყობინებები ვერ ჩაიტვირთა." }, 500);
    }
}
