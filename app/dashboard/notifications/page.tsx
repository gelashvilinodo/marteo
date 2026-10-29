import { redirect } from "next/navigation";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { openNotifications } from "@/lib/notifications/user-notifications";
import NotificationsView from "@/components/dashboard/notifications/NotificationsView";
import { getVapidPublicKey } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const context = await getPgDashboardContext();
    if (!context) redirect("/login");
    const notifications = await openNotifications(context.user.id, context.membership?.businessId ?? null);
    return <NotificationsView notifications={notifications.map(n => ({ ...n, deliverAt: n.deliverAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))} pushKey={getVapidPublicKey()} />;
}
