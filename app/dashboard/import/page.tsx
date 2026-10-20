import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import ImportWorkspace from "@/components/dashboard/imports/ImportWorkspace";

export default async function ImportPage() {
    const user = await getCurrentUser();

    if (!user) redirect("/login");

    const membership = await getCurrentBusiness();

    if (!membership) redirect("/business/onboarding");

    const prisma = createPrismaClient();

    try {
        const access = await prisma.businessMembership.findUnique({
            where: {
                userId_businessId: {
                    userId: user.id,
                    businessId: membership.businessId,
                },
            },
            select: { role: true },
        });

        if (
            !access ||
            !["OWNER", "ADMIN"].includes(access.role)
        ) {
            return (
                <main className="p-4 sm:p-6">
                    <p className="text-text-secondary">
                        იმპორტი ხელმისაწვდომია ბიზნესის მფლობელისა
                        და ადმინისტრატორისთვის.
                    </p>
                </main>
            );
        }
    } finally {
        await prisma.$disconnect();
    }

    return <ImportWorkspace />;
}