import Image from "next/image";
import Link from "next/link";

import type { HomeLists as HomeListsData } from "@/lib/dashboard/get-home-lists";
import { productThumbnailUrl } from "@/lib/images/product-thumbnail-url";

function formatNumber(value: string) {
    const [integer, decimal] = value.split(".");

    return (
        integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
        (decimal !== undefined ? `.${decimal}` : "")
    );
}

const statuses: Record<
    string,
    { label: string; className: string }
> = {
    PROCESSING: {
        label: "მუშავდება",
        className: "bg-warning/10 text-warning",
    },
    SHIPPED: {
        label: "გაგზავნილი",
        className: "bg-accent/10 text-accent",
    },
    COMPLETED: {
        label: "დასრულებული",
        className: "bg-success/10 text-success",
    },
    CANCELED: {
        label: "გაუქმებული",
        className: "bg-danger/10 text-danger",
    },
    RETURNED: {
        label: "დაბრუნებული",
        className: "bg-warning/10 text-warning",
    },
};

export default function HomeLists({
    data,
}: {
    data: HomeListsData;
}) {
    return (
        <section className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                <header className="flex h-24 shrink-0 flex-wrap content-center items-center justify-between gap-2 border-b border-border px-4 sm:px-5">
                    <h2 className="text-base font-semibold text-text-primary">
                        ბოლო შეკვეთები
                    </h2>

                    <Link
                        href="/dashboard/orders"
                        prefetch={false}
                        className="text-xs font-medium text-accent hover:underline"
                    >
                        ყველა შეკვეთა →
                    </Link>
                </header>

                {data.orders.length === 0 ? (
                    <p className="p-5 text-sm text-text-secondary">
                        შეკვეთები ჯერ არ არის დამატებული.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {data.orders.map(order => {
                            const status = statuses[order.status] ?? {
                                label: order.status,
                                className: "bg-background text-text-secondary",
                            };

                            return (
                                <li
                                    key={order.id}
                                    className="grid h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] content-center items-center gap-x-3 gap-y-2 px-4 sm:px-5"
                                >
                                    <span className="whitespace-nowrap text-sm font-semibold text-text-primary tabular-nums">
                                        {order.number === null
                                            ? "უნომრო"
                                            : `#${String(order.number).padStart(4, "0")}`}
                                    </span>

                                    <span
                                        title={order.recipientName}
                                        className="min-w-0 truncate text-sm text-text-primary"
                                    >
                                        {order.recipientName}
                                    </span>

                                    <span className="whitespace-nowrap text-sm font-semibold text-text-primary tabular-nums">
                                        {formatNumber(order.total)} ₾
                                    </span>

                                    <span
                                        className={`col-span-3 justify-self-start rounded-lg px-2 py-1 text-xs font-medium ${status.className}`}
                                    >
                                        {status.label}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </article>

            <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                <header className="flex h-24 shrink-0 flex-wrap content-center items-center justify-between gap-2 border-b border-border px-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-text-primary">
                            ყველაზე გაყიდვადი პროდუქტები
                        </h2>
                    </div>

                    <Link
                        href="/dashboard/inventory"
                        prefetch={false}
                        className="text-xs font-medium text-accent hover:underline"
                    >
                        მარაგების ნახვა →
                    </Link>
                </header>

                {data.products.length === 0 ? (
                    <p className="p-5 text-sm leading-relaxed text-text-secondary">
                        ამ პერიოდში გაყიდული პროდუქტები ჯერ არ არის.
                    </p>
                ) : (
                    <ol className="divide-y divide-border">
                        {data.products.map((product, index) => (
                            <li
                                key={product.key}
                                className="flex h-24 min-w-0 items-center gap-3 px-4 sm:px-5"
                            >
                                <span className="w-4 shrink-0 text-xs text-text-secondary tabular-nums">
                                    {index + 1}
                                </span>

                                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                                    {product.imageUrl ? (
                                        <Image
                                            src={productThumbnailUrl(
                                                product.imageUrl,
                                            )}
                                            alt=""
                                            width={44}
                                            height={44}
                                            unoptimized
                                            loading="lazy"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="22"
                                            height="22"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.7"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                            className="text-accent"
                                        >
                                            <path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9" />
                                        </svg>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p
                                        title={product.name}
                                        className="truncate text-sm font-medium text-text-primary"
                                    >
                                        {product.name}
                                    </p>

                                    <p className="mt-1 text-xs text-text-secondary">
                                        {formatNumber(product.quantity)} ერთეული
                                    </p>
                                </div>

                                <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-text-primary tabular-nums">
                                    {formatNumber(product.revenue)} ₾
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </article>
        </section>
    );
}