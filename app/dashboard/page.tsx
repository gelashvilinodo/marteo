import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";

import {
    getHomeSummary,
    type HomeSearchParams,
} from "@/lib/dashboard/get-home-summary";
import { getHomeLists } from "@/lib/dashboard/get-home-lists";
import { getHomeTrend } from "@/lib/dashboard/get-home-trend";

import HomeView from "@/components/dashboard/home/HomeView";

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<HomeSearchParams>;
}) {
    const user = await getCurrentUser();

    if (!user) redirect("/login");

    const membership = await getCurrentBusiness();

    if (!membership) redirect("/business/onboarding");

    const summary = await getHomeSummary(
        membership.businessId,
        await searchParams,
    );

    const [lists, trend] = summary.isNewBusiness
        ? [null, null]
        : await Promise.all([
            getHomeLists(
                membership.businessId,
                summary.from,
                summary.to,
            ),
            getHomeTrend(
                membership.businessId,
                summary.from,
                summary.to,
                summary.profit !== null,
            ),
        ]);

    return (
        <HomeView
            key={membership.businessId}
            firstName={user.firstName}
            businessId={membership.businessId}
            initialData={{ summary, lists, trend }}
        />
    );
}