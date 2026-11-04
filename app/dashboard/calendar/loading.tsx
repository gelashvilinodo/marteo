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
        <main aria-busy="true" className="min-w-0 p-4 sm:p-6 lg:px-8 lg:py-6">
            <span role="status" className="sr-only">
                კონტენტ-კალენდარი იტვირთება
            </span>

            <div
                aria-hidden="true"
                className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 motion-safe:animate-pulse 2xl:max-w-[120rem]"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        კონტენტ-კალენდარი
                    </h1>
                    <div className="h-11 w-40 rounded-xl bg-success/15" />
                </div>

                <div className="flex min-w-0 flex-col gap-4 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-rows-[max(26rem,calc(100dvh-9.25rem))]">
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)] 2xl:order-2 2xl:flex 2xl:min-h-0 2xl:flex-col">
                        <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-[repeat(3,8rem)] xl:grid-cols-[repeat(3,9rem)] 2xl:grid-cols-1 2xl:gap-2">
                            {[0, 1, 2].map(index => (
                                <section
                                    key={index}
                                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] content-between items-center gap-x-2 gap-y-2 rounded-2xl border border-border bg-surface p-2.5 sm:content-center sm:gap-x-3 sm:p-3 lg:content-between"
                                >
                                    <Placeholder className="h-8 w-8 rounded-lg sm:row-span-2 sm:h-10 sm:w-10 lg:row-span-1 lg:h-8 lg:w-8" />
                                    <Placeholder className="h-5 w-6 justify-self-end sm:justify-self-start lg:justify-self-end" />
                                    <Placeholder className="col-span-2 h-3 w-full sm:col-span-1 sm:col-start-2 lg:col-span-2 lg:col-start-1" />
                                </section>
                            ))}
                        </div>

                        <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 2xl:min-h-0 2xl:flex-1">
                            <div className="flex items-center justify-between gap-3">
                                <Placeholder className="h-4 w-44 max-w-full" />
                                <Placeholder className="h-3 w-4 shrink-0" />
                            </div>

                            <div className="mt-2 flex gap-2 overflow-hidden pb-1 2xl:flex-col">
                                {[0, 1].map(index => (
                                    <div
                                        key={index}
                                        className="w-60 shrink-0 space-y-2 rounded-xl border border-border bg-background px-3 py-2 2xl:w-full"
                                    >
                                        <Placeholder className="h-3 w-3/5" />
                                        <div className="flex items-center gap-2">
                                            <Placeholder className="h-3 w-3" />
                                            <Placeholder className="h-2 w-16" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <section className="flex h-[min(85dvh,50rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:h-[calc(100dvh-9.25rem)] lg:min-h-[26rem] 2xl:order-1 2xl:h-auto">
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
                                <div key={index} className="flex h-8 items-center justify-center">
                                    <Placeholder className="h-3 w-6" />
                                </div>
                            ))}
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
                            {Array.from({ length: 42 }, (_, index) => (
                                <div
                                    key={index}
                                    className="min-h-0 min-w-0 overflow-hidden border-b border-r border-border p-1"
                                >
                                    <Placeholder className="h-6 w-6 rounded-full" />

                                    {[9, 16, 22, 30].includes(index) && (
                                        <Placeholder className="mt-1 hidden h-[18px] w-full sm:block" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}