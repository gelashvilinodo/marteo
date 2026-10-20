import OrdersListSkeleton from "@/components/dashboard/orders/OrdersListSkeleton";
import CourierReminderSkeleton from "@/components/dashboard/orders/CourierReminderSkeleton";

export default function OrdersLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto min-w-0 max-w-7xl">
                <div className="@container w-full min-w-0">
                    <div className="flex min-w-0 flex-col gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start @min-[32rem]:justify-end">
                        <h1 className="order-0 w-full min-w-0 text-2xl font-semibold text-text-primary @min-[48rem]:w-auto @min-[48rem]:flex-1">
                            შეკვეთები
                        </h1>

                        <div
                            aria-hidden="true"
                            className="order-1 h-11 w-full rounded-xl bg-success/15 motion-safe:animate-pulse @min-[32rem]:order-2 @min-[32rem]:w-44"
                        />

                        <div
                            aria-hidden="true"
                            className="order-2 h-11 w-full rounded-xl border border-border bg-surface motion-safe:animate-pulse @min-[32rem]:order-1 @min-[32rem]:w-48"
                        />
                    </div>
                </div>

                <div
                    aria-hidden="true"
                    className="mt-3 h-4 w-52 max-w-full rounded bg-border/35 motion-safe:animate-pulse"
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
                                <div className="size-8 rounded-xl bg-accent/10 lg:size-9" />

                                <div
                                    className={[
                                        "h-3 w-4/5 rounded bg-border/45",
                                        index === 0
                                            ? "lg:col-span-2 lg:row-start-2 lg:mt-1"
                                            : "col-span-2 row-start-2 mt-1",
                                    ].join(" ")}
                                />

                                <div
                                    className={[
                                        "ml-auto h-5 w-8 rounded bg-border/55 lg:h-6",
                                        index === 0
                                            ? "lg:col-start-2 lg:row-start-1"
                                            : "col-start-2 row-start-1",
                                    ].join(" ")}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <CourierReminderSkeleton />

                <section className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex items-center justify-between gap-3 p-4">
                        <h2 className="font-semibold text-text-primary">
                            შეკვეთების სია
                        </h2>

                        <div
                            aria-hidden="true"
                            className="h-3 w-20 rounded bg-border/35 motion-safe:animate-pulse"
                        />
                    </div>

                    <div
                        aria-hidden="true"
                        className="space-y-3 px-3 pb-4 motion-safe:animate-pulse sm:px-4"
                    >
                        <div className="flex h-11 items-center gap-3 rounded-xl border border-border px-3">
                            <div className="size-4 rounded bg-border/45" />
                            <div className="h-3 w-32 rounded bg-border/35" />
                        </div>

                        <div className="flex gap-2">
                            <div className="h-10 w-28 rounded-xl border border-border bg-background" />
                            <div className="h-10 w-36 rounded-xl border border-border bg-background" />
                        </div>
                    </div>

                    <OrdersListSkeleton />
                </section>
            </div>
        </main>
    );
}