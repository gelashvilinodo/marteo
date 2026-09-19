import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
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

    const prisma = createPrismaClient();

    const membership = await prisma.businessMembership.findFirst({
        where: {
            userId: user.id,
        },
        orderBy: {
            createdAt: "asc",
        },
        select: {
            business: {
                select: {
                    id: true,
                    name: true,
                    logoUrl: true,
                },
            },
        },
    });

    if (!membership) {
        redirect("/business/onboarding");
    }

    return (
        <DashboardShell
            businessName={membership.business.name}
            businessLogoUrl={membership.business.logoUrl}
            userName={user.firstName || ""}
            userEmail={user.email}
        >
            {children}
        </DashboardShell>
    );
}