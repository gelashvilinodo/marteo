"use client";

import { usePlan } from "@/components/dashboard/plan/PlanContext";
import { CornerCrown } from "@/components/dashboard/plan/PlanCrown";
import { planAllows } from "@/lib/subscription/plan-state";
import { PLAN_LIMITS } from "@/lib/subscription/plans";

function Placeholder({
    className = "",
    tone = "bg-border/40",
}: {
    className?: string;
    tone?: string;
}) {
    return (
        <div
            className={`max-w-full rounded-md ${tone} ${className}`}
        />
    );
}

// Match UsageMeter's card spacing without displaying invented usage values.
function UsagePlaceholder({ locked = false }: { locked?: boolean }) {
    return (
        <div className="relative min-w-0 rounded-xl bg-background p-4">
            {locked && <CornerCrown pro />}
            <div className={locked ? "opacity-50" : ""}>
            <div className="flex min-w-0 items-center gap-2">
                <Placeholder className="size-5 shrink-0" />
                <Placeholder className="h-5 w-36" />
            </div>
            <Placeholder className="mt-2 h-7 w-24" />
            <Placeholder className="mt-3 h-2 w-full rounded-full" />
            <Placeholder className="mt-2 h-4 w-24" />
            </div>
        </div>
    );
}

export default function BusinessSettingsLoading() {
    const { plan } = usePlan();
    const aiLocked = Boolean(plan && !planAllows(plan, "ai"));
    const filesLocked = Boolean(plan && !planAllows(plan, "aiFiles"));
    const smsLocked = Boolean(plan && !planAllows(plan, "sms"));
    const sharedFiles = plan?.tier ? PLAN_LIMITS[plan.tier].aiFilesAreQuestions : false;

    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <span role="status" className="sr-only">
                ბიზნესის პარამეტრები იტვირთება…
            </span>

            <div className="w-full max-w-[840px] space-y-5">
                <h1 className="text-2xl font-semibold text-text-primary">
                    ბიზნესის პარამეტრები
                </h1>

                <div
                    aria-hidden="true"
                    className="space-y-5 motion-safe:animate-pulse"
                >
                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="size-5 shrink-0" />
                            <Placeholder className="h-5 w-44 max-w-full" />
                        </div>

                        <div className="mt-5 space-y-5">
                            <div className="flex items-center gap-3">
                                <Placeholder className="size-16 shrink-0 rounded-xl" />

                                <div className="min-w-0 space-y-2">
                                    <Placeholder className="h-10 w-36 max-w-full rounded-xl" />
                                    <Placeholder className="h-3 w-40 max-w-full" />
                                    <Placeholder className="h-3 w-48 max-w-full" />
                                </div>
                            </div>

                            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                                <div className="min-w-0 space-y-2">
                                    <Placeholder className="h-5 w-32" />
                                    <Placeholder className="h-11 w-full rounded-xl" />
                                </div>

                                <div className="min-w-0 space-y-2">
                                    <Placeholder className="h-5 w-36" />
                                    <Placeholder className="h-11 w-full rounded-xl" />
                                    <Placeholder className="h-4 w-48 max-w-full" />
                                </div>
                            </div>
                            {/* BusinessModeChoice: three options on every screen size. */}
                            <div className="min-w-0 space-y-2">
                                <Placeholder className="mb-2 h-5 w-44" />
                                <div className="grid min-w-0 grid-cols-3 gap-2">
                                    {[0, 1, 2].map(mode => (
                                        <div key={mode} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-background px-2 py-3">
                                            <Placeholder className="size-5" />
                                            <Placeholder className="h-4 w-20 sm:h-5" />
                                        </div>
                                    ))}
                                </div>
                                <Placeholder className="h-5 w-full max-w-md" />
                                <Placeholder className="h-5 w-full max-w-xl" />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <Placeholder className="h-10 w-40 max-w-full rounded-xl" />
                            <Placeholder className="h-10 w-48 max-w-full rounded-xl" />
                        </div>
                    </section>

                    {/* PlanLimitsCard */}
                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Placeholder className="size-5 shrink-0" />
                                    <Placeholder className="h-6 w-32" />
                                </div>
                                <Placeholder className="mt-1 h-5 w-64" />
                            </div>
                            <Placeholder className="h-10 w-44" />
                        </div>
                        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                            <UsagePlaceholder />
                            <UsagePlaceholder locked={aiLocked} />
                            {!sharedFiles && <UsagePlaceholder locked={filesLocked} />}
                        </div>
                    </section>

                    {/* SmsSettingsCard: preview, balances and the four packs. */}
                    <section className="relative min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        {smsLocked && <CornerCrown pro />}
                        <div className={smsLocked ? "opacity-50" : ""}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <Placeholder className="size-5 shrink-0" />
                                    <Placeholder className="h-6 w-44" />
                                </div>
                                <div className="mt-1 space-y-1">
                                    <Placeholder className="h-5 w-full max-w-xl" />
                                    <Placeholder className="h-5 w-40" />
                                </div>
                            </div>
                            <Placeholder className="h-7 w-12 shrink-0 rounded-full" />
                        </div>
                        <div className="mt-4 min-w-0 rounded-xl bg-background p-3">
                            <Placeholder className="h-4 w-64" />
                            <div className="mt-1 space-y-1">
                                <Placeholder className="h-5 w-full" />
                                <Placeholder className="h-5 w-2/3" />
                            </div>
                        </div>
                        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                            <UsagePlaceholder />
                            <div className="min-w-0 rounded-xl bg-background p-4">
                                <div className="flex items-center gap-2">
                                    <Placeholder className="size-5 shrink-0" />
                                    <Placeholder className="h-5 w-28" />
                                </div>
                                <Placeholder className="mt-2 h-7 w-16" />
                                <Placeholder className="mt-2 h-4 w-full" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <Placeholder className="h-5 w-28" />
                            <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                                {[0, 1, 2, 3].map(pack => (
                                    <div key={pack} className="min-w-0 rounded-xl border border-border bg-background p-3">
                                        <Placeholder className="mx-auto h-6 w-20" />
                                        <Placeholder className="mx-auto mt-1 h-4 w-12" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        </div>
                    </section>

                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Placeholder className="size-5 shrink-0" />
                                    <Placeholder className="h-5 w-20" />
                                </div>

                                <Placeholder className="mt-2 h-4 w-64 max-w-full" />
                            </div>

                            <Placeholder className="h-11 w-full shrink-0 rounded-xl sm:w-44" tone="bg-success/15" />
                        </div>

                        <ul className="mt-3 divide-y divide-border">
                            {["w-36", "w-28"].map(width => (
                                <li
                                    key={width}
                                    className="flex min-w-0 items-start gap-3 py-3"
                                >
                                    <Placeholder className="size-10 shrink-0 rounded-full" />

                                    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Placeholder className={`h-4 max-w-full ${width}`} />
                                            <Placeholder className="h-5 w-16 shrink-0 rounded-full" />
                                        </div>

                                        <Placeholder className="h-5 w-48" />
                                        <div className="flex flex-wrap gap-1.5">
                                            <Placeholder className="h-5 w-20 rounded-lg" />
                                            <Placeholder className="h-5 w-24 rounded-lg" />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Placeholder className="h-9 w-28 rounded-xl" />
                                            <Placeholder className="h-9 w-20 rounded-xl" />
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="size-5 shrink-0" />
                            <Placeholder className="h-5 w-24" />
                        </div>

                        <div className="mt-2 space-y-2">
                            <Placeholder className="h-4 w-full max-w-lg" />
                            <Placeholder className="h-4 w-48 max-w-full" />
                        </div>

                        <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
                            {[0, 1, 2].map(item => (
                                <Placeholder
                                    key={item}
                                    className="h-11 min-w-0 rounded-xl"
                                />
                            ))}
                        </div>

                        <Placeholder className="mt-3 h-4 w-48 max-w-full" />
                    </section>

                    {["w-44", "w-52"].map(width => (
                        <section
                            key={width}
                            className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
                        >
                            <div className="flex items-center gap-2">
                                <Placeholder className="size-5 shrink-0" />
                                <Placeholder className={`h-5 max-w-full ${width}`} />
                            </div>

                            <div className="mt-2 space-y-2">
                                <Placeholder className="h-4 w-full max-w-xl" />
                                <Placeholder className="h-4 w-56 max-w-full" />
                            </div>

                            <Placeholder className="mt-4 h-11 w-44 max-w-full rounded-xl" />
                        </section>
                    ))}

                    <section className="rounded-2xl min-w-0 border-2 border-red-600/40 bg-red-600/5 p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="size-5 shrink-0" tone="bg-red-600/20" />
                            <Placeholder className="h-5 w-32" tone="bg-red-600/20" />
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                                <Placeholder className="h-4 w-32" />
                                <Placeholder className="h-4 w-full max-w-md" />
                            </div>

                            <Placeholder className="h-11 w-full shrink-0 rounded-xl sm:w-40" tone="bg-red-600/15" />
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
