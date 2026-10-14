function Placeholder({
    className = "",
}: {
    className?: string;
}) {
    return (
        <div
            className={`rounded bg-text-secondary/10 ${className}`}
        />
    );
}

const panel =
    "min-w-0 rounded-2xl border border-border bg-surface p-4";

export default function AnalyticsLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <span role="status" className="sr-only">
                ანალიტიკა იტვირთება
            </span>

            <div
                aria-hidden="true"
                className="mx-auto min-w-0 max-w-7xl space-y-5 motion-safe:animate-pulse"
            >
                <div className="space-y-3">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto]">
                        <h1 className="col-span-2 row-start-1 text-2xl font-semibold text-text-primary lg:col-span-1 lg:col-start-1">
                            ანალიტიკა
                        </h1>

                        <Placeholder className="col-start-1 row-start-2 h-11 w-full rounded-xl lg:col-start-2 lg:row-start-1" />

                        <div className="col-start-2 row-start-2 h-11 w-36 rounded-xl bg-success/15 sm:w-40 lg:col-start-3 lg:row-start-1" />
                    </div>

                    <Placeholder className="h-3 w-52 max-w-full" />
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className={panel}>
                            <div className="flex items-center gap-2">
                                <Placeholder className="h-9 w-9 shrink-0 rounded-xl" />
                                <Placeholder className="h-4 w-24 max-w-full" />
                            </div>

                            <Placeholder className="mt-4 h-8 w-28 max-w-full" />

                            <div className="mt-3 space-y-2">
                                <Placeholder className="h-3 w-full" />
                                <Placeholder className="h-3 w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <section className={panel}>
                        <div className="flex items-start justify-between gap-3">
                            <Placeholder className="mt-2 h-5 w-28 max-w-full" />
                            <div className="grid w-40 shrink-0 grid-cols-2 gap-2">
                                <Placeholder className="h-10 rounded-xl" />
                                <Placeholder className="h-10 rounded-xl" />
                            </div>
                        </div>

                        <Placeholder className="mt-4 h-3 w-4/5" />

                        <div className="mt-5 grid h-64 grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
                            <div className="flex flex-col justify-between py-3 pb-9">
                                {Array.from({ length: 5 }, (_, index) => (
                                    <Placeholder
                                        key={index}
                                        className="h-2 w-7"
                                    />
                                ))}
                            </div>

                            <div className="grid min-w-0 grid-cols-7 items-end gap-2 border-b border-border pb-8">
                                {[28, 48, 36, 72, 42, 86, 58].map(
                                    (height, index) => (
                                        <div
                                            key={index}
                                            className="flex h-full flex-col items-center justify-end gap-3"
                                        >
                                            <div
                                                style={{ height: `${height}%` }}
                                                className="w-2 rounded-full bg-accent/15 sm:w-3"
                                            />
                                            <Placeholder className="h-2 w-5" />
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        <Placeholder className="mt-3 h-2 w-44 max-w-full" />

                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                            <div className="space-y-2">
                                <Placeholder className="h-4 w-24" />
                                <Placeholder className="h-3 w-16" />
                            </div>
                            <Placeholder className="h-6 w-20" />
                        </div>

                        <Placeholder className="mt-4 h-3 w-4/5" />
                    </section>

                    <section className={`${panel} flex flex-col`}>
                        <Placeholder className="h-5 w-44 max-w-full" />
                        <Placeholder className="mt-3 h-3 w-40 max-w-full" />

                        <div className="my-5 grid min-w-0 flex-1 grid-cols-2 items-center gap-3 sm:gap-5">
                            <div className="relative mx-auto aspect-square w-full max-w-64 rounded-full border-[20px] border-text-secondary/10 sm:border-[28px]">
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                    <Placeholder className="h-3 w-16 max-w-full" />
                                    <Placeholder className="h-5 w-20 max-w-full" />
                                </div>
                            </div>

                            <div className="space-y-5">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <div key={index} className="flex gap-2">
                                        <Placeholder className="mt-1 h-3 w-3 shrink-0 rounded-full" />
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <Placeholder className="h-3 w-full" />
                                            <Placeholder className="h-5 w-20 max-w-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Placeholder className="h-3 w-4/5" />
                    </section>
                </div>

                <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
                    <section className="@container min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="h-5 w-5 shrink-0" />
                            <Placeholder className="h-5 w-28 max-w-full" />
                        </div>

                        <div className="mt-4 grid min-w-0 gap-3 @[30rem]:grid-cols-3">
                            {Array.from({ length: 3 }, (_, index) => (
                                <div
                                    key={index}
                                    className="min-w-0 rounded-xl border border-border bg-background p-4"
                                >
                                    <Placeholder className="h-3 w-28 max-w-full" />
                                    <Placeholder className="mt-3 h-7 w-24 max-w-full" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 space-y-2">
                            <Placeholder className="h-3 w-full" />
                            <Placeholder className="h-3 w-3/4" />
                        </div>
                    </section>

                    <section className="@container min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                            <Placeholder className="h-5 w-5 shrink-0" />
                            <Placeholder className="h-5 w-40 max-w-full" />
                        </div>

                        <div className="mt-4 grid min-w-0 gap-3 @[26rem]:grid-cols-2">
                            {Array.from({ length: 2 }, (_, index) => (
                                <div
                                    key={index}
                                    className="min-w-0 rounded-xl border border-border bg-background p-4"
                                >
                                    <div
                                        className={`h-5 w-5 rounded ${index === 0
                                                ? "bg-success/15"
                                                : "bg-warning/15"
                                            }`}
                                    />

                                    <div className="mt-2 space-y-2">
                                        <Placeholder className="h-3 w-full" />
                                        <Placeholder className="h-3 w-3/4" />
                                    </div>

                                    <Placeholder className="mt-2 h-7 w-24 max-w-full" />

                                    <div className="mt-2 space-y-2">
                                        <Placeholder className="h-3 w-full" />
                                        <Placeholder className="h-3 w-2/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <Placeholder className="h-5 w-44 max-w-full" />
                        <Placeholder className="h-11 w-full rounded-xl sm:w-52" />
                    </div>

                    <Placeholder className="mx-4 mb-4 h-3 w-3/4" />

                    <div className="hidden h-11 border-y border-border bg-background md:block" />

                    {Array.from({ length: 5 }, (_, index) => (
                        <div
                            key={index}
                            className="space-y-3 border-t border-border p-4 md:flex md:items-center md:gap-5 md:space-y-0"
                        >
                            <div className="hidden md:block">
                                <Placeholder className="h-3 w-24" />
                            </div>

                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <Placeholder className="h-4 w-40 max-w-full" />
                                    <Placeholder className="h-3 w-48 max-w-full" />
                                </div>
                                <Placeholder className="h-5 w-20 shrink-0 md:hidden" />
                            </div>

                            <Placeholder className="h-3 w-28 md:hidden" />

                            <div className="flex items-center justify-between gap-3">
                                <Placeholder className="h-7 w-28 rounded-lg" />
                                <Placeholder className="h-10 w-10 rounded-xl md:hidden" />
                            </div>

                            <Placeholder className="hidden h-5 w-20 md:block" />
                            <Placeholder className="hidden h-3 w-20 md:block" />
                            <Placeholder className="hidden h-10 w-10 rounded-xl md:block" />
                        </div>
                    ))}

                    <div className="flex justify-center gap-2 border-t border-border p-4">
                        {[0, 1, 2].map(index => (
                            <Placeholder
                                key={index}
                                className="h-9 w-9 rounded-lg"
                            />
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}