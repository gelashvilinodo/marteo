import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
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
        redirect("/business/onboarding");
    }

    return (
        <DashboardShell
            isPlatformAdmin={Boolean(await getAdminUser())}
            businessMode={membership.business.mode}
            businessName={membership.business.name}
            businessLogoUrl={membership.business.logoUrl}
            userName={user.firstName || ""}
            userEmail={user.email}
        >
            {children}
        </DashboardShell>
    );
}