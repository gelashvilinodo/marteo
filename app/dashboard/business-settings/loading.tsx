function Placeholder({
    className = "",
    tone = "bg-border/40",
}: {
    className?: string;
    tone?: string;
}) {
    return (
        <div
            className={`rounded-md ${tone} ${className}`}
        />
    );
}

export default function BusinessSettingsLoading() {
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
                    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <Placeholder className="h-10 w-40 max-w-full rounded-xl" />
                            <Placeholder className="h-10 w-48 max-w-full rounded-xl" />
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
                                        <div className="flex items-center gap-2">
                                            <Placeholder className={`h-4 max-w-full ${width}`} />
                                            <Placeholder className="h-5 w-16 shrink-0 rounded-full" />
                                        </div>

                                        <Placeholder className="h-3.5 w-48 max-w-full" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
                            className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
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

                    <section className="rounded-2xl border-2 border-danger/30 bg-danger/5 p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="size-5 shrink-0" tone="bg-danger/20" />
                            <Placeholder className="h-5 w-32" tone="bg-danger/20" />
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                                <Placeholder className="h-4 w-32" />
                                <Placeholder className="h-4 w-full max-w-md" />
                            </div>

                            <Placeholder className="h-11 w-full shrink-0 rounded-xl sm:w-40" tone="bg-danger/15" />
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}