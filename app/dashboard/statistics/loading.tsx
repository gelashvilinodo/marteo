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

export default function StatisticsLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <span role="status" className="sr-only">
                სტატისტიკა იტვირთება
            </span>

            <div
                aria-hidden="true"
                className="mx-auto min-w-0 max-w-7xl space-y-5 motion-safe:animate-pulse"
            >
                <div className="space-y-3">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_10rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                        <h1 className="text-2xl font-semibold text-text-primary">
                            სტატისტიკა
                        </h1>

                        <Placeholder className="h-11 rounded-xl" />
                    </div>

                    <Placeholder className="h-3 w-44 max-w-full" />
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <section key={index} className={panel}>
                            <div className="flex items-start gap-3">
                                <Placeholder className="h-10 w-10 shrink-0 rounded-xl" />

                                <div className="min-w-0 flex-1">
                                    <Placeholder className="h-3 w-full" />
                                    <Placeholder className="mt-2 h-7 w-12" />
                                </div>
                            </div>

                            <Placeholder className="mt-3 h-3 w-full" />
                        </section>
                    ))}
                </div>

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <section className={panel}>
                        <Placeholder className="h-5 w-44 max-w-full" />
                        <Placeholder className="mt-3 h-3 w-4/5" />

                        <div className="mt-5 grid h-64 grid-cols-[2rem_minmax(0,1fr)] gap-2">
                            <div className="flex flex-col justify-between py-3 pb-9">
                                {Array.from({ length: 5 }, (_, index) => (
                                    <Placeholder
                                        key={index}
                                        className="h-2 w-5"
                                    />
                                ))}
                            </div>

                            <div className="grid min-w-0 grid-cols-7 items-end gap-2 border-b border-border pb-8">
                                {[32, 54, 25, 72, 46, 88, 62].map(
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

                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                            <div className="space-y-2">
                                <Placeholder className="h-4 w-24" />
                                <Placeholder className="h-3 w-32 max-w-full" />
                            </div>

                            <Placeholder className="h-7 w-8 shrink-0" />
                        </div>

                        <Placeholder className="mt-3 h-3 w-44 max-w-full" />
                    </section>

                    <section className={`${panel} flex flex-col`}>
                        <Placeholder className="h-5 w-36" />
                        <Placeholder className="mt-3 h-3 w-40 max-w-full" />

                        <div className="my-5 grid min-w-0 flex-1 grid-cols-2 items-center gap-3 sm:gap-5">
                            <div className="relative mx-auto aspect-square w-full max-w-64 rounded-full border-[20px] border-text-secondary/10 sm:border-[28px]">
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                    <Placeholder className="h-3 w-16 max-w-full" />
                                    <Placeholder className="h-5 w-20 max-w-full" />
                                </div>
                            </div>

                            <div className="min-w-0 space-y-5">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <div key={index} className="flex gap-2">
                                        <Placeholder className="mt-1 h-3 w-3 shrink-0 rounded-full" />

                                        <div className="min-w-0 flex-1 space-y-2">
                                            <Placeholder className="h-3 w-full" />
                                            <Placeholder className="h-4 w-16 max-w-full" />
                                            <Placeholder className="h-2 w-8" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Placeholder className="h-3 w-4/5" />
                    </section>
                </div>

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    {[0, 1].map(section => (
                        <section key={section} className={panel}>
                            <Placeholder className="h-5 w-52 max-w-full" />

                            <div className="mt-4 space-y-4">
                                {Array.from({ length: 5 }, (_, index) => (
                                    <div
                                        key={index}
                                        className="flex min-w-0 items-center gap-3"
                                    >
                                        <Placeholder className="h-3 w-4 shrink-0" />

                                        <Placeholder
                                            className={`h-10 w-10 shrink-0 ${
                                                section === 0
                                                    ? "rounded-lg"
                                                    : "rounded-full"
                                            }`}
                                        />

                                        <div className="min-w-0 flex-1">
                                            <Placeholder className="h-3 w-3/4" />
                                            <Placeholder className="mt-2 h-1.5 w-full rounded-full" />
                                        </div>

                                        <Placeholder className="h-3 w-12 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {[0, 1].map(index => (
                        <section
                            key={index}
                            className={`${panel} flex items-center gap-3`}
                        >
                            <Placeholder className="h-8 w-8 shrink-0 rounded-lg" />

                            <div className="min-w-0 flex-1">
                                <Placeholder className="h-3 w-40 max-w-full" />
                                <Placeholder className="mt-2 h-5 w-24" />
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </main>
    );
}