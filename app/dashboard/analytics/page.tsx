import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getAnalyticsSnapshot } from "@/lib/analytics/get-analytics-snapshot";
import type { AnalyticsSearchParams } from "@/lib/analytics/get-analytics-page";
import AnalyticsView from "@/components/dashboard/analytics/AnalyticsView";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearchParams> }) {
    if (!(await getCurrentUser())) redirect("/login");
    const membership = await getCurrentBusiness();
    if (!membership) redirect("/business/onboarding");
    const snapshot = await getAnalyticsSnapshot(membership.businessId, await searchParams);
    return <AnalyticsView key={`${snapshot.data.period}-${snapshot.data.from}-${snapshot.data.to}`} initialSnapshot={snapshot} businessId={membership.businessId} />;
}
