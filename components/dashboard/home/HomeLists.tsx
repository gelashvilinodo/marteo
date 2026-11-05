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

// Quantities are stored with 6 decimals; show "8", "2.5", not "8.000000".
function formatQuantity(value: string) {
    return formatNumber(
        value.includes(".") ? value.replace(/\.?0+$/, "") : value,
    );
}

function Thumbnail({ imageUrl }: { imageUrl: string | null }) {
    return (
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
            {imageUrl ? (
                <Image
                    src={productThumbnailUrl(imageUrl)}
                    alt=""
                    width={48}
                    height={48}
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
                                    className="flex h-24 min-w-0 items-center gap-3 px-4 sm:px-5"
                                >
                                    <div className="relative shrink-0">
                                        <Thumbnail imageUrl={order.imageUrl} />

                                        {order.itemCount > 1 && (
                                            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] font-semibold text-white tabular-nums">
                                                +{order.itemCount - 1}
                                            </span>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="flex min-w-0 items-baseline gap-2 text-sm">
                                            <span className="shrink-0 font-semibold text-text-primary tabular-nums">
                                                {order.number === null
                                                    ? "უნომრო"
                                                    : `#${String(order.number).padStart(4, "0")}`}
                                            </span>

                                            <span
                                                title={order.recipientName}
                                                className="min-w-0 truncate font-medium text-text-primary"
                                            >
                                                {order.recipientName}
                                            </span>
                                        </p>

                                        <p className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-text-secondary">
                                            <span
                                                className={`shrink-0 rounded-md px-2 py-0.5 font-medium ${status.className}`}
                                            >
                                                {status.label}
                                            </span>

                                            {order.itemCount > 0 && (
                                                <span className="truncate">
                                                    {order.itemCount} პროდუქტი
                                                </span>
                                            )}
                                        </p>
                                    </div>

                                    <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-text-primary tabular-nums">
                                        {formatNumber(order.total)} ₾
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

                                <Thumbnail imageUrl={product.imageUrl} />

                                <div className="min-w-0 flex-1">
                                    <p
                                        title={product.name}
                                        className="truncate text-sm font-medium text-text-primary"
                                    >
                                        {product.name}
                                    </p>

                                    <p className="mt-1.5 text-xs text-text-secondary">
                                        {formatQuantity(product.quantity)} ერთეული
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