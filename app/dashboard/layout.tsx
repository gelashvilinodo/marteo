import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness, getUserBusinesses, hasFrozenMembership } from "@/lib/auth/current-business";
import { getAdminUser } from "@/lib/admin/authorization";
import DashboardShell from "@/components/dashboard/DashboardShell";

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

    return (
        <DashboardShell
            isPlatformAdmin={Boolean(await getAdminUser())}
            isOwner={membership.access.role === "OWNER"}
            access={membership.access}
            businessMode={membership.business.mode}
            businessName={membership.business.name}
            businessLogoUrl={membership.business.logoUrl}
            businessId={membership.businessId}
            businesses={await getUserBusinesses()}
            userName={user.firstName || ""}
            userEmail={user.email}
        >
            {children}
        </DashboardShell>
    );
}