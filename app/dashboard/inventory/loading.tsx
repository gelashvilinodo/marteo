import InventoryProductsSkeleton from "@/components/dashboard/inventory/InventoryProductsSkeleton";

export default function InventoryLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto min-w-0 max-w-7xl">
                <h1 className="text-2xl font-semibold text-text-primary">
                    მარაგები
                </h1>

                <div
                    aria-hidden="true"
                    className={
                        "mt-6 grid grid-cols-2 gap-3 " +
                        "motion-safe:animate-pulse lg:grid-cols-4 lg:gap-4"
                    }
                >
                    {Array.from({ length: 4 }, (_, index) => (
                        <div
                            key={index}
                            className="rounded-2xl border border-border bg-surface p-3 sm:p-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-border/50" />
                                <div className="h-3 w-2/3 rounded bg-border/60" />
                            </div>

                            <div className="mt-3 h-6 w-3/4 rounded bg-border/50" />
                        </div>
                    ))}
                </div>

                <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
                    <section className="min-w-0 rounded-2xl border border-border bg-surface">
                        <div
                            aria-hidden="true"
                            className="space-y-4 p-4 motion-safe:animate-pulse sm:p-5"
                        >
                            <div className="h-5 w-36 rounded bg-border/60" />
                            <div className="h-11 rounded-xl border border-border bg-background" />
                        </div>

                        <InventoryProductsSkeleton />
                    </section>

                    <div
                        aria-hidden="true"
                        className="min-w-0 space-y-4 motion-safe:animate-pulse"
                    >
                        <div className="rounded-2xl border border-border bg-surface p-4">
                            <div className="h-5 w-32 rounded bg-border/60" />

                            <div className="mx-auto my-6 h-40 w-40 rounded-full border-[22px] border-border/50" />

                            <div className="mx-auto h-3 w-3/4 rounded bg-border/50" />
                        </div>

                        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
                            <div className="h-5 w-36 rounded bg-border/60" />

                            {Array.from({ length: 3 }, (_, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-3"
                                >
                                    <div className="h-9 w-9 rounded-xl bg-border/50" />

                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-3/4 rounded bg-border/50" />
                                        <div className="h-2 w-1/2 rounded bg-border/40" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}