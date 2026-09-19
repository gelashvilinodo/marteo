import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

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

    return <>{children}</>;
}