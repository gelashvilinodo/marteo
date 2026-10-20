import { redirect } from "next/navigation";

import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import ProfileSettingsForm from "@/components/dashboard/profile/ProfileSettingsForm";
import PasswordSettingsForm from "@/components/dashboard/profile/PasswordSettingsForm";

export default async function ProfilePage() {
    const prisma = createPrismaClient();

    try {
        const user = await getCurrentUserWithClient(() => prisma);

        if (!user) {
            redirect("/login");
        }

        const profile = await prisma.user.findUnique({
            where: {
                id: user.id,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                email: true,
                phone: true,
                emailVerifiedAt: true,
                phoneVerifiedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!profile) {
            redirect("/login");
        }

        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl space-y-5">
                    <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <span
                            aria-hidden="true"
                            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                className="size-6"
                            >
                                <circle
                                    cx="12"
                                    cy="8"
                                    r="4"
                                    fill="currentColor"
                                />
                                <path
                                    d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </span>

                        <div className="min-w-0">
                            <h1 className="text-2xl font-semibold text-text-primary">
                                ჩემი პროფილი
                            </h1>
                            <p className="mt-1 text-sm text-text-secondary">
                                პირადი ინფორმაცია და ანგარიშის უსაფრთხოება
                            </p>
                        </div>
                    </section>

                    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                        <ProfileSettingsForm
                            initialProfile={{
                                ...profile,
                                emailVerifiedAt:
                                    profile.emailVerifiedAt?.toISOString() ??
                                    null,
                                phoneVerifiedAt:
                                    profile.phoneVerifiedAt?.toISOString() ??
                                    null,
                                createdAt:
                                    profile.createdAt.toISOString(),
                                updatedAt:
                                    profile.updatedAt.toISOString(),
                            }}
                        />

                        <PasswordSettingsForm />
                    </div>
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}