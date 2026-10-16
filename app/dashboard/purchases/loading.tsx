function Pulse({ className = "" }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-lg bg-text-secondary/10 motion-reduce:animate-none ${className}`}
        />
    );
}

function PurchaseCardSkeleton() {
    return (
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Pulse className="h-7 w-14" />
                        <Pulse className="h-5 w-28 max-w-full" />
                        <Pulse className="h-6 w-20" />
                    </div>

                    <Pulse className="mt-2 h-4 w-24" />
                </div>

                <div className="flex shrink-0 gap-1">
                    <Pulse className="h-11 w-11 rounded-xl" />
                    <Pulse className="h-11 w-11 rounded-xl" />
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    {[0, 1, 2].map(index => (
                        <Pulse
                            key={index}
                            className="h-12 w-12 rounded-xl sm:h-14 sm:w-14"
                        />
                    ))}
                </div>

                <Pulse className="h-4 w-24" />
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Pulse className="h-4 w-36" />

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 sm:justify-end">
                    <Pulse className="h-4 w-28" />
                    <Pulse className="h-6 w-24" />
                </div>
            </div>
        </div>
    );
}

export default function PurchasesLoading() {
    return (
        <main
            role="status"
            aria-busy="true"
            aria-label="შესყიდვები იტვირთება"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <span className="sr-only">შესყიდვები იტვირთება…</span>

            <div aria-hidden="true" className="mx-auto min-w-0 max-w-7xl">
                <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <Pulse className="h-8 w-36" />
                    <Pulse className="h-11 w-full rounded-xl sm:w-44" />
                </div>

                <div className="mt-4 min-w-0 rounded-2xl border border-border bg-surface sm:mt-6">
                    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 sm:hidden">
                        <div className="flex items-center gap-2">
                            <Pulse className="h-4 w-4" />
                            <Pulse className="h-4 w-32" />
                        </div>
                        <Pulse className="h-4 w-4" />
                    </div>

                    <div className="hidden p-4 sm:block">
                        <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
                            <div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1">
                                <Pulse className="h-5 w-12" />
                                <Pulse className="h-11 w-full rounded-xl" />
                            </div>

                            {[0, 1].map(index => (
                                <div key={index} className="min-w-0 space-y-1.5">
                                    <Pulse className="h-5 w-20" />
                                    <Pulse className="h-11 w-full rounded-xl" />
                                </div>
                            ))}

                            <Pulse className="h-11 w-full rounded-xl sm:col-span-2 xl:col-span-1 xl:w-24" />
                        </div>
                    </div>
                </div>

                <Pulse className="mt-4 h-5 w-24" />

                <div className="mt-6 space-y-4">
                    {[0, 1, 2].map(index => (
                        <PurchaseCardSkeleton key={index} />
                    ))}
                </div>
            </div>
        </main>
    );
}