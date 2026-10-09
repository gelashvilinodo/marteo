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
                        className="flex gap-3 motion-safe:animate-pulse"
                    >
                        <div className="h-11 w-36 rounded-xl bg-border/40" />
                        <div className="h-11 w-36 rounded-xl bg-success/15" />
                    </div>
                </div>

                <div
                    aria-hidden="true"
                    className={
                        "mt-6 grid grid-cols-2 gap-3 " +
                        "motion-safe:animate-pulse lg:grid-cols-5"
                    }
                >
                    {Array.from({ length: 5 }, (_, index) => (
                        <div
                            key={index}
                            className="rounded-2xl border border-border bg-surface p-3 sm:p-4"
                        >
                            <div className="flex items-center gap-2">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-border/50" />
                                <div className="h-3 w-2/3 rounded bg-border/60" />
                            </div>

                            <div className="mt-3 h-6 w-12 rounded bg-border/50" />
                        </div>
                    ))}
                </div>

                <section className="mt-6 min-w-0 rounded-2xl border border-border bg-surface">
                    <div
                        aria-hidden="true"
                        className="space-y-4 p-4 motion-safe:animate-pulse"
                    >
                        <div className="h-5 w-40 rounded bg-border/60" />
                        <div className="h-11 rounded-xl border border-border bg-background" />

                        <div className="flex gap-2">
                            <div className="h-10 w-24 rounded-xl bg-border/40" />
                            <div className="h-10 w-36 rounded-xl bg-border/40" />
                        </div>
                    </div>

                    <OrdersListSkeleton />
                </section>
            </div>
        </main>
    );
}