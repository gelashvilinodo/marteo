import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import LogoutButton from "@/components/auth/LogoutButton";

export default async function DashboardPage() {
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
                    name: true,
                },
            },
        },
    });

    if (!membership) {
        redirect("/business/onboarding");
    }

    return (
        <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <p className="text-sm font-medium text-accent">
                            MARTEO.GE
                        </p>

                        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
                            {membership.business.name}
                        </h1>

                        <p className="mt-2 text-sm text-text-secondary">
                            მოგესალმებით, {user.firstName || user.email}
                        </p>
                    </div>

                    <LogoutButton />
                </header>

                <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
                    <h2 className="text-lg font-semibold text-text-primary">
                        დეშბორდი
                    </h2>

                    <p className="mt-2 text-sm text-text-secondary">
                        თქვენ შესული ხართ თქვენს ანგარიშში.
                    </p>
                </section>
            </div>
        </main>
    );
}