import { requireDashboardSection } from "@/lib/business/access";
import PlanGatedLink from "@/components/dashboard/plan/PlanGatedLink";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import BusinessSettingsForm from "@/components/dashboard/business/BusinessSettingsForm";
import AppearanceSettings from "@/components/dashboard/business/AppearanceSettings";
import TeamSection from "@/components/dashboard/business/TeamSection";
import DangerZone from "@/components/dashboard/business/DangerZone";
import { getTeamSnapshot } from "@/lib/business/team-server";
import { enforceTeamLimitsFor } from "@/lib/business/team-manage";
import { getBillingOverview } from "@/lib/subscription/billing";
import PlanLimitsCard from "@/components/plans/PlanLimitsCard";
import SmsSettingsCard from "@/components/plans/SmsSettingsCard";
import { getSmsUsage, shippedMessage } from "@/lib/sms/order-sms";

export default async function BusinessSettingsPage() {
    await requireDashboardSection("/dashboard/business-settings");
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
                mode: true,
                logoUrl: true,
                phone: true,
                updatedAt: true,
            },
        });

        if (!business) redirect("/business/onboarding");

        await enforceTeamLimitsFor(prisma, [business.id]);
        const [team, overview, sms] = await Promise.all([
            getTeamSnapshot(prisma, business.id, user.id),
            getBillingOverview(prisma, user.id, business.id),
            getSmsUsage(prisma, business.id),
        ]);

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
                    <PlanLimitsCard overview={overview} />
                    <SmsSettingsCard initial={sms} preview={shippedMessage(business.name, 1024)} />
                    <TeamSection initialTeam={team} businessMode={business.mode} />
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

                        <PlanGatedLink
                            href="/dashboard/import"
                            feature="fileImport"
                            className="mt-4 inline-flex min-h-11 max-w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            იმპორტზე გადასვლა
                        </PlanGatedLink>
                    </section>

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
                                <path d="M3 21h18M5 21V7l7-4 7 4v14" />
                                <path d="M12 10v6m-3-3h6" />
                            </svg>
                            ახალი ბიზნესის დამატება
                        </h2>

                        <p className="mt-2 text-sm text-text-secondary">
                            შექმენი კიდევ ერთი ბიზნესი იმავე ანგარიშით. თითოეულს
                            ცალკე შეკვეთები, მარაგი და ანალიტიკა აქვს, ხოლო მათ
                            შორის გადართვა პროფილის მენიუდან შეგიძლია.
                        </p>

                        <PlanGatedLink
                            href="/business/new"
                            feature="extraBusiness"
                            className="mt-4 inline-flex min-h-11 max-w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-center text-sm font-medium text-text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            ბიზნესის დამატება
                        </PlanGatedLink>
                    </section>

                    <DangerZone
                        businessName={business.name}
                        ownerCount={team.members.filter(member => member.role === "OWNER" && member.status === "ACTIVE").length}
                    />
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}