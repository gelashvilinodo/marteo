function Placeholder({
    className = "",
}: {
    className?: string;
}) {
    return (
        <div className={`rounded bg-text-secondary/10 ${className}`} />
    );
}

export default function CalendarLoading() {
    return (
        <main aria-busy="true" className="min-w-0 p-4 sm:p-6 lg:p-8">
            <span role="status" className="sr-only">
                კონტენტ-კალენდარი იტვირთება
            </span>

            <div
                aria-hidden="true"
                className="mx-auto min-w-0 max-w-7xl space-y-5 motion-safe:animate-pulse"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        კონტენტ-კალენდარი
                    </h1>
                    <div className="h-11 w-40 rounded-xl bg-success/15" />
                </div>

                <div className="grid min-w-0 grid-cols-3 items-start gap-2 sm:gap-3 xl:grid-cols-5">
                    {[0, 1, 2].map(index => (
                        <section
                            key={index}
                            className="flex h-36 min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 sm:h-40 sm:p-4"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <Placeholder className="h-8 w-8 shrink-0 rounded-lg sm:h-9 sm:w-9" />
                                <Placeholder className="h-6 w-6" />
                            </div>
                            <Placeholder className="mt-3 h-3 w-full" />
                            <Placeholder className="mt-2 h-3 w-3/4" />
                            <div className="mt-auto pt-2">
                                <Placeholder className="h-2 w-12" />
                            </div>
                        </section>
                    ))}

                    <section className="col-span-3 flex h-44 min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 sm:p-4 xl:col-span-2 xl:h-40">
                        <div className="flex items-center justify-between gap-3">
                            <Placeholder className="h-4 w-44 max-w-full" />
                            <Placeholder className="h-3 w-4 shrink-0" />
                        </div>

                        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-hidden">
                            {[0, 1].map(index => (
                                <div
                                    key={index}
                                    className="space-y-2 rounded-xl border border-border bg-background px-3 py-2"
                                >
                                    <Placeholder className="h-3 w-3/5" />
                                    <div className="flex items-center gap-2">
                                        <Placeholder className="h-3 w-3" />
                                        <Placeholder className="h-2 w-16" />
                                        <Placeholder className="h-2 w-12" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="flex h-[min(85dvh,50rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-3">
                        <div className="flex items-center gap-2">
                            <Placeholder className="h-10 w-10 rounded-xl" />
                            <Placeholder className="h-4 w-32" />
                            <Placeholder className="h-10 w-10 rounded-xl" />
                        </div>

                        <div className="flex items-center gap-2">
                            <Placeholder className="h-10 w-16 rounded-xl" />
                            <Placeholder className="h-10 w-44 rounded-xl" />
                        </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-7 border-b border-border">
                        {Array.from({ length: 7 }, (_, index) => (
                            <div key={index} className="flex justify-center py-3">
                                <Placeholder className="h-3 w-6" />
                            </div>
                        ))}
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
                        {Array.from({ length: 42 }, (_, index) => (
                            <div
                                key={index}
                                className="min-h-0 min-w-0 overflow-hidden border-b border-r border-border p-1 sm:p-2"
                            >
                                <Placeholder className="h-5 w-5 rounded-full" />

                                {[9, 16, 22, 30].includes(index) && (
                                    <div className="mt-2 hidden space-y-2 rounded-lg border border-border bg-background p-2 sm:block">
                                        <Placeholder className="h-3 w-full" />
                                        <div className="flex gap-1">
                                            <Placeholder className="h-3 w-3" />
                                            <Placeholder className="h-3 w-3" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}