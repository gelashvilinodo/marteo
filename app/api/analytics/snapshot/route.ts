import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getAnalyticsSnapshot } from "@/lib/analytics/get-analytics-snapshot";
import { orderJson, orderError } from "@/lib/orders/order-http";

export async function GET(request: Request) {
    try {
        if (!(await getCurrentUser())) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        const membership = await getCurrentBusiness();
        if (!membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        const search = new URL(request.url).searchParams;
        const period = search.get("trendPeriod") ?? "week";
        if (period !== "week" && period !== "month" && period !== "year") {
            return orderJson({ success: false, message: "აირჩიე დიაგრამის პერიოდი." }, 400);
        }
        const data = await getAnalyticsSnapshot(membership.businessId, Object.fromEntries(search), period);
        return orderJson({ success: true, data });
    } catch (cause) { return orderError(cause); }
}
