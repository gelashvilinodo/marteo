import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness, getUserBusinesses, hasFrozenMembership } from "@/lib/auth/current-business";
import { getAdminUser } from "@/lib/admin/authorization";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SystemBannerBar from "@/components/dashboard/SystemBannerBar";
import { getActiveBanner } from "@/lib/system/active-banner";

// ჩანართის სათაური დაშბორდში; გვერდები, რომლებსაც საკუთარი სათაური აქვთ, მას ანაცვლებენ.
export const metadata = {
    title: "დაშბორდი - MARTEO",
    robots: { index: false, follow: false },
};

type DashboardLayoutProps = {
    children: ReactNode;
};

export default async function DashboardLayout({
    children,
}: DashboardLayoutProps) {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const membership = await getCurrentBusiness();

    if (!membership) {
        redirect(await hasFrozenMembership(user.id) ? "/business/frozen" : "/business/onboarding");
    }

    const banner = await getActiveBanner();

    return (
        <DashboardShell
            isPlatformAdmin={Boolean(await getAdminUser())}
            isOwner={membership.access.role === "OWNER"}
            access={membership.access}
            plan={membership.plan}
            businessMode={membership.business.mode}
            businessName={membership.business.name}
            businessLogoUrl={membership.business.logoUrl}
            businessId={membership.businessId}
            businesses={await getUserBusinesses()}
            userName={user.firstName || ""}
            userEmail={user.email}
        >
            {banner && <SystemBannerBar banner={banner} />}
            {children}
        </DashboardShell>
    );
}