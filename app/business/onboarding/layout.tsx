import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import LogoutButton from "@/components/auth/LogoutButton";

export default async function OnboardingLayout({
    children,
}: {
    children: ReactNode;
}) {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const prisma = createPrismaClient();

    const membership = await prisma.businessMembership.findFirst({
        where: {
            userId: user.id,
        },
        select: {
            id: true,
        },
    });

    if (membership) {
        redirect("/dashboard");
    }

    return (
        <>
            <div className="flex justify-end bg-background px-4 pt-4 sm:px-6">
                <LogoutButton />
            </div>
            {children}
        </>
    );
}