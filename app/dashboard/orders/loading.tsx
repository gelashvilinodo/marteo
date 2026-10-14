import OrdersListSkeleton from "@/components/dashboard/orders/OrdersListSkeleton";

export default function OrdersLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto min-w-0 max-w-7xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        შეკვეთები
                    </h1>

                    <div
                        aria-hidden="true"
                        className="grid gap-3 motion-safe:animate-pulse sm:flex"
                    >
                        <div className="h-11 w-full rounded-xl border border-border bg-surface sm:w-44" />
                        <div className="h-11 w-full rounded-xl bg-success/15 sm:w-40" />
                    </div>
                </div>

                <div
                    aria-hidden="true"
                    className="mt-3 h-3 w-52 max-w-full rounded bg-border/35 motion-safe:animate-pulse"
                />

                <div
                    aria-hidden="true"
                    className="mt-6 grid min-w-0 grid-cols-2 gap-3 motion-safe:animate-pulse lg:grid-cols-5 lg:gap-4"
                >
                    {Array.from({ length: 5 }, (_, index) => (
                        <div
                            key={index}
                            className={[
                                "min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4",
                                index === 0
                                    ? "col-span-2 lg:col-span-1"
                                    : "",
                            ].join(" ")}
                        >
                            <div
                                className={[
                                    "grid min-w-0 items-center gap-2",
                                    index === 0
                                        ? "grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)]"
                                        : "grid-cols-[auto_minmax(0,1fr)]",
                                ].join(" ")}
                            >
                                <div className="h-8 w-8 rounded-xl bg-accent/10 lg:h-9 lg:w-9" />

                                <div
                                    className={[
                                        "h-3 w-4/5 rounded bg-border/50",
                                        index === 0
                                            ? "lg:col-span-2 lg:row-start-2 lg:mt-1"
                                            : "col-span-2 row-start-2 mt-1",
                                    ].join(" ")}
                                />

                                <div
                                    className={[
                                        "ml-auto h-5 w-6 rounded bg-border/60 lg:h-6",
                                        index === 0
                                            ? "lg:col-start-2 lg:row-start-1"
                                            : "col-start-2 row-start-1",
                                    ].join(" ")}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <section className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
                    <div
                        aria-hidden="true"
                        className="flex items-center gap-3 p-4 motion-safe:animate-pulse"
                    >
                        <div className="h-5 w-5 shrink-0 rounded bg-accent/15" />
                        <div className="h-4 w-36 max-w-full rounded bg-border/55" />
                        <div className="h-3 w-16 rounded bg-border/30" />
                    </div>

                    <div
                        aria-hidden="true"
                        className="space-y-4 p-3 motion-safe:animate-pulse sm:p-4"
                    >
                        <div className="flex h-11 items-center gap-3 rounded-xl border border-border px-3">
                            <div className="h-5 w-5 rounded-full bg-accent/10" />
                            <div className="h-3 w-36 max-w-full rounded bg-border/45" />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <div className="h-10 w-28 rounded-xl border border-border bg-background" />
                            <div className="h-10 w-40 rounded-xl border border-border bg-background" />
                        </div>
                    </div>

                    <OrdersListSkeleton />
                </section>
            </div>
        </main>
    );
}