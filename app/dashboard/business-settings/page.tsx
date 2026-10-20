import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import BusinessSettingsForm from "@/components/dashboard/business/BusinessSettingsForm";
import AppearanceSettings from "@/components/dashboard/business/AppearanceSettings";

export default async function BusinessSettingsPage() {
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
            select: {
                role: true,
            },
        });

        if (
            !access ||
            !["OWNER", "ADMIN"].includes(access.role)
        ) {
            redirect("/dashboard");
        }

        const business = await prisma.business.findUnique({
            where: {
                id: membership.businessId,
            },
            select: {
                id: true,
                name: true,
                logoUrl: true,
                phone: true,
                updatedAt: true,
            },
        });

        if (!business) redirect("/business/onboarding");

        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="w-full max-w-[840px] space-y-5">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        ბიზნესის პარამეტრები
                    </h1>

                    <BusinessSettingsForm
                        initialBusiness={{
                            ...business,
                            updatedAt: business.updatedAt.toISOString(),
                        }}
                    />
                    <AppearanceSettings />

                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-5 shrink-0 text-accent"
                                aria-hidden="true"
                            >
                                <path d="M12 3v12m-4-4 4 4 4-4" />
                                <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                            </svg>
                            მონაცემების იმპორტი
                        </h2>

                        <p className="mt-2 text-sm text-text-secondary">
                            გადმოიტანე მომხმარებლები, პროდუქტები,
                            მარაგები და ძველი შეკვეთები ფაილიდან.
                        </p>

                        <Link
                            href="/dashboard/import"
                            className="mt-4 inline-flex min-h-11 max-w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            იმპორტზე გადასვლა
                        </Link>
                    </section>
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}