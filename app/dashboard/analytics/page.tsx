import { requireDashboardSection } from "@/lib/business/access";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getAnalyticsSnapshot } from "@/lib/analytics/get-analytics-snapshot";
import type { AnalyticsSearchParams } from "@/lib/analytics/get-analytics-page";
import AnalyticsView from "@/components/dashboard/analytics/AnalyticsView";

export const metadata = { title: "ანალიტიკა - MARTEO" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearchParams> }) {
    await requireDashboardSection("/dashboard/analytics");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const membership = await getCurrentBusiness();
    if (!membership) redirect("/business/onboarding");
    const snapshot = await getAnalyticsSnapshot(membership.businessId, await searchParams);
    return <AnalyticsView key={`${snapshot.data.period}-${snapshot.data.from}-${snapshot.data.to}`} initialSnapshot={snapshot} businessId={membership.businessId} showTour={!user.seenTours.includes("analytics")} />;
}
