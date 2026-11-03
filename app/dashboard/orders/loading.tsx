import OrdersListSkeleton from "@/components/dashboard/orders/OrdersListSkeleton";
import { orderCards } from "@/components/dashboard/orders/order-labels";

// ყველა ბლოკი იმავე ზომებით და იმავე წყვეტის წერტილებით იხატება, რაც
// OrdersView-ში, რომ გვერდის ჩატვირთვისას განლაგება არ გადახტეს.
export default function OrdersLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto min-w-0 max-w-7xl">
                {/* სათაური, ახალი შეკვეთა და პერიოდი — PeriodFilter-ის container query-ებით. */}
                <div className="@container w-full min-w-0 max-w-full">
                    <div className="flex min-w-0 flex-col gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start @min-[32rem]:justify-end">
                        <div className="order-0 w-full min-w-0 @min-[48rem]:w-auto @min-[48rem]:flex-1">
                            <h1 className="text-2xl font-semibold text-text-primary">
                                შეკვეთები
                            </h1>
                        </div>

                        <div
                            aria-hidden="true"
                            className="order-1 h-11 w-full rounded-xl bg-success/20 motion-safe:animate-pulse @min-[32rem]:order-2 @min-[32rem]:w-44"
                        />

                        <div
                            aria-hidden="true"
                            className="order-2 flex h-11 w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-3 motion-safe:animate-pulse @min-[32rem]:order-1 @min-[32rem]:w-56 @min-[32rem]:shrink-0"
                        >
                            <div className="size-4 shrink-0 rounded bg-border/50" />
                            <div className="h-3 w-24 rounded bg-border/40" />
                            <div className="ml-auto size-3 shrink-0 rounded bg-border/40" />
                        </div>
                    </div>
                </div>

                <div
                    aria-hidden="true"
                    className="mt-3 flex h-4 items-center"
                >
                    <div className="h-3 w-52 max-w-full rounded bg-border/35 motion-safe:animate-pulse" />
                </div>

                {/* სტატუსის ბარათები: ტელეფონზე 2 სვეტი (პირველი სრულ სიგანეზე), დიდ ეკრანზე 5. */}
                <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                    {orderCards.map((card) => (
                        <div
                            key={card.id}
                            className={[
                                "min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4",
                                card.id === "all"
                                    ? "col-span-2 lg:col-span-1"
                                    : "",
                            ].join(" ")}
                        >
                            <div
                                className={[
                                    "grid min-w-0 items-center gap-2",
                                    card.id === "all"
                                        ? "grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)]"
                                        : "grid-cols-[auto_minmax(0,1fr)]",
                                ].join(" ")}
                            >
                                <span
                                    aria-hidden="true"
                                    className={[
                                        "size-8 shrink-0 rounded-xl lg:size-9",
                                        card.tone,
                                    ].join(" ")}
                                />

                                <span
                                    className={[
                                        "min-w-0 [overflow-wrap:anywhere] text-xs font-medium leading-relaxed text-text-secondary lg:text-sm",
                                        card.id === "all"
                                            ? "lg:col-span-2 lg:row-start-2 lg:mt-1"
                                            : "col-span-2 row-start-2 mt-1",
                                    ].join(" ")}
                                >
                                    {card.title}
                                </span>

                                <span
                                    aria-hidden="true"
                                    className={[
                                        "flex h-7 min-w-0 items-center justify-end lg:h-8",
                                        card.id === "all"
                                            ? "lg:col-start-2 lg:row-start-1"
                                            : "col-start-2 row-start-1",
                                    ].join(" ")}
                                >
                                    <span className="h-5 w-8 rounded bg-border/55 motion-safe:animate-pulse lg:h-6 lg:w-10" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                <section className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex items-center gap-2 p-4">
                        <div
                            aria-hidden="true"
                            className="size-5 rounded-md bg-accent/15"
                        />
                        <h2 className="font-semibold text-text-primary">
                            შეკვეთების სია
                        </h2>
                        <div
                            aria-hidden="true"
                            className="h-3 w-16 rounded bg-border/35 motion-safe:animate-pulse"
                        />
                    </div>

                    {/* ძებნა და ფილტრები — დაკეცილი მდგომარეობა. */}
                    <div
                        aria-hidden="true"
                        className="px-3 pb-4 sm:px-4"
                    >
                        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                                <div className="size-4 shrink-0 rounded bg-accent/20" />
                                <div className="h-3 w-36 max-w-full rounded bg-border/40 motion-safe:animate-pulse" />
                            </div>
                            <div className="size-4 shrink-0 rounded bg-border/40" />
                        </div>
                    </div>

                    {/* მოქმედებების ზოლი — ერთ ხაზზე, ვიწრო ეკრანზე ბოლო ღილაკები იჭრება. */}
                    <div
                        aria-hidden="true"
                        className="border-t border-border px-3 py-3 sm:px-4"
                    >
                        <div className="-my-1 flex items-center gap-2 overflow-hidden py-1 motion-safe:animate-pulse [&>*]:shrink-0">
                            <div className="h-10 w-28 rounded-xl border border-border" />
                            <div className="h-10 w-52 rounded-xl border border-border" />
                            <div className="h-10 w-60 rounded-xl border border-border" />
                        </div>
                    </div>

                    <OrdersListSkeleton />
                </section>
            </div>
        </main>
    );
}
