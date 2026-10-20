function Placeholder({
    className = "",
}: {
    className?: string;
}) {
    return (
        <div
            className={`max-w-full rounded-md bg-border/40 ${className}`}
        />
    );
}

function CardHeading() {
    return (
        <div className="flex items-start gap-3 border-b border-border pb-4">
            <Placeholder className="size-6 shrink-0" />

            <div className="min-w-0 flex-1 space-y-2">
                <Placeholder className="h-5 w-40" />
                <Placeholder className="h-3 w-56" />
            </div>
        </div>
    );
}

export default function ProfileLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <span role="status" className="sr-only">
                პროფილი იტვირთება…
            </span>

            <div className="mx-auto w-full max-w-6xl space-y-5">
                <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                    <Placeholder className="size-11 shrink-0 rounded-full motion-safe:animate-pulse" />

                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold text-text-primary">
                            ჩემი პროფილი
                        </h1>
                        <p className="mt-1 text-sm text-text-secondary">
                            პირადი ინფორმაცია და ანგარიშის უსაფრთხოება
                        </p>
                    </div>
                </section>

                <div
                    aria-hidden="true"
                    className="grid min-w-0 items-start gap-5 motion-safe:animate-pulse lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
                >
                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <CardHeading />

                        <div className="flex min-w-0 items-center gap-4 py-5">
                            <Placeholder className="size-20 shrink-0 rounded-full" />

                            <div className="min-w-0 flex-1 space-y-2">
                                <Placeholder className="h-5 w-44" />
                                <Placeholder className="h-3 w-28" />
                                <Placeholder className="h-10 w-36 rounded-xl" />
                                <Placeholder className="h-3 w-40" />
                            </div>
                        </div>

                        <div className="min-w-0 space-y-4 border-t border-border pt-5">
                            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                                {[0, 1].map(item => (
                                    <div
                                        key={item}
                                        className="min-w-0 space-y-2"
                                    >
                                        <Placeholder className="h-5 w-16" />
                                        <Placeholder className="h-11 w-full rounded-xl" />
                                    </div>
                                ))}
                            </div>

                            {[0, 1].map(item => (
                                <div
                                    key={item}
                                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
                                >
                                    <Placeholder className="col-start-1 row-start-1 h-5 w-20" />

                                    <div className="col-span-2 col-start-1 row-start-2 flex min-h-11 min-w-0 flex-col justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 lg:col-span-1 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                                        <Placeholder className="h-4 w-40" />
                                        <Placeholder className="h-4 w-28 shrink-0" />
                                    </div>

                                    <Placeholder className="col-start-2 row-start-1 h-10 w-20 rounded-lg lg:row-start-2" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 space-y-4 border-t border-border pt-4">
                            <Placeholder className="h-4 w-40" />

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Placeholder className="h-10 w-36 rounded-xl" />

                                <div className="flex max-w-full flex-wrap gap-2">
                                    <Placeholder className="h-10 w-20 rounded-xl" />
                                    <Placeholder className="h-10 w-40 rounded-xl" />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <CardHeading />

                        <div className="mt-5 min-w-0 space-y-4">
                            {[0, 1, 2].map(item => (
                                <div
                                    key={item}
                                    className="min-w-0 space-y-2"
                                >
                                    <Placeholder className="h-5 w-40" />

                                    <div className="flex h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3">
                                        <Placeholder className="h-3 w-28" />
                                        <Placeholder className="size-5 shrink-0" />
                                    </div>
                                </div>
                            ))}

                            <div className="grid min-w-0 grid-cols-2 gap-2">
                                {[0, 1, 2, 3].map(item => (
                                    <Placeholder
                                        key={item}
                                        className="h-4 w-full"
                                    />
                                ))}
                            </div>
                        </div>

                        <Placeholder className="mt-3 h-5 w-36" />
                        <Placeholder className="mt-5 h-11 w-full rounded-xl" />
                    </section>
                </div>
            </div>
        </main>
    );
}