"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";

import type { InventoryProduct } from "./InventoryView";

type Props = {
    products: InventoryProduct[];
    showDefective: boolean;
};

function formatQuantity(value: number) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatMoney(value: string | null) {
    if (value === null) return "—";

    const amount = Number(value);

    if (!Number.isFinite(amount)) return "—";

    return `${amount.toFixed(2)} ₾`;
}

function formatDate(value: string) {
    const [year, month, day] = value.slice(0, 10).split("-");

    return `${day}.${month}.${year}`;
}

function getStatuses(product: InventoryProduct) {
    const primary =
        product.goodStock === 0
            ? {
                label: "ამოწურული",
                icon: "solar:close-circle-linear",
                color: "bg-danger/10 text-danger",
            }
            : product.goodStock < 5
                ? {
                    label: "დაბალი მარაგი",
                    icon: "solar:danger-triangle-linear",
                    color: "bg-warning/10 text-warning",
                }
                : {
                    label: "მარაგშია",
                    icon: "solar:check-circle-linear",
                    color: "bg-success/10 text-success",
                };

    return [
        primary,
        ...(product.defectiveStock > 0
            ? [
                {
                    label: `წუნდებული · ${formatQuantity(product.defectiveStock)}`,
                    icon: "solar:shield-warning-linear",
                    color: "bg-accent/10 text-accent",
                },
            ]
            : []),
    ];
}

export default function InventoryProducts({
    products,
    showDefective,
}: Props) {
    const [selected, setSelected] = useState<InventoryProduct | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!selected) return;

        const dialog = dialogRef.current;
        if (!dialog) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        if (!dialog.open) {
            dialog.showModal();
        }

        return () => {
            if (dialog.open) {
                dialog.close();
            }

            document.body.style.overflow = previousOverflow;
        };
    }, [selected]);

    function closeDetails() {
        dialogRef.current?.close();
    }

    const details = selected
        ? [
            ["ბრენდი", selected.brand || "—"],
            ["კატეგორია", selected.category || "—"],
            ["SKU", selected.sku],
            ["ფერი", selected.color || "—"],
            ["ზომა", selected.size || "—"],
            ["სულ დარჩენილი", `${formatQuantity(selected.totalStock)} პროდუქტი`],
            ["რეალიზებადი", `${formatQuantity(selected.goodStock)} პროდუქტი`],
            ["წუნდებული", `${formatQuantity(selected.defectiveStock)} პროდუქტი`],
            ["გასაყიდი ფასი", formatMoney(selected.salePrice)],
            ["დამატების თარიღი", formatDate(selected.createdAt)],
        ]
        : [];

    return (
        <>
            <table className="w-full table-fixed text-left">
                <caption className="sr-only">
                    პროდუქტების მარაგი
                </caption>

                <thead className="sticky top-15 z-20 bg-background">
                    <tr className="border-y border-border text-[11px] text-text-secondary md:text-xs">
                        <th
                            scope="col"
                            className="px-3 py-3 font-medium md:w-[24%]"
                        >
                            პროდუქტი
                        </th>

                        <th
                            scope="col"
                            className="hidden px-2 py-3 font-medium md:table-cell md:w-[12%]"
                        >
                            კატეგორია
                        </th>

                        <th
                            scope="col"
                            className="hidden px-2 py-3 font-medium md:table-cell md:w-[18%]"
                        >
                            SKU
                        </th>

                        <th
                            scope="col"
                            className="hidden px-2 py-3 font-medium md:table-cell md:w-[14%]"
                        >
                            ფერი / ზომა
                        </th>

                        <th
                            scope="col"
                            className="w-[15%] px-1 py-3 text-center font-medium md:w-[9%]"
                        >
                            {showDefective ? "წუნი" : "მარაგი"}
                        </th>

                        <th
                            scope="col"
                            className="w-[19%] px-1 py-3 text-center font-medium md:w-[16%] md:text-left"
                        >
                            სტატუსი
                        </th>

                        <th
                            scope="col"
                            className="w-11 px-1 py-3 md:w-[7%]"
                        >
                            <span className="sr-only">დეტალები</span>
                        </th>
                    </tr>
                </thead>

                <tbody>
                    {products.map((product) => {
                        const quantity = showDefective
                            ? product.defectiveStock
                            : product.goodStock;

                        return (
                            <tr
                                key={product.id}
                                className="border-b border-border last:border-b-0"
                            >
                                <td className="min-w-0 px-3 py-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background md:h-10 md:w-10">
                                            {product.imageUrl ? (
                                                <Image
                                                    src={product.imageUrl}
                                                    alt=""
                                                    fill
                                                    sizes="(max-width: 767px) 32px, 40px"
                                                    className="object-contain p-0.5"
                                                />
                                            ) : (
                                                <Icon
                                                    icon="solar:box-linear"
                                                    aria-hidden="true"
                                                    className="h-5 w-5 text-text-secondary"
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="line-clamp-2 break-words text-xs font-semibold text-text-primary md:text-sm">
                                                {product.name}
                                            </p>

                                            {product.brand && (
                                                <p className="mt-1 hidden truncate text-xs text-text-secondary md:block">
                                                    {product.brand}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                <td className="hidden break-words px-2 py-3 text-xs text-text-secondary md:table-cell">
                                    {product.category || "—"}
                                </td>

                                <td className="hidden px-2 py-3 text-xs text-text-secondary md:table-cell">
                                    <span
                                        title={product.sku}
                                        className="block truncate"
                                    >
                                        {product.sku}
                                    </span>
                                </td>

                                <td className="hidden break-words px-2 py-3 text-xs text-text-secondary md:table-cell">
                                    {[product.color, product.size]
                                        .filter(Boolean)
                                        .join(" · ") || "—"}
                                </td>

                                <td className="px-1 py-3 text-center">
                                    <span
                                        className={[
                                            "text-sm font-semibold tabular-nums",
                                            showDefective
                                                ? "text-accent"
                                                : quantity === 0
                                                    ? "text-danger"
                                                    : "text-text-primary",
                                        ].join(" ")}
                                    >
                                        {formatQuantity(quantity)}
                                    </span>
                                </td>

                                <td className="px-1 py-3 md:px-2">
                                    <div className="flex flex-wrap justify-center gap-1 md:justify-start">
                                        {getStatuses(product).map((status) => (
                                            <span
                                                key={status.label}
                                                title={status.label}
                                                className={[
                                                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                                                    "md:h-auto md:w-auto md:gap-1 md:px-2 md:py-1",
                                                    status.color,
                                                ].join(" ")}
                                            >
                                                <Icon
                                                    icon={status.icon}
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 shrink-0"
                                                />

                                                <span className="sr-only text-[11px] font-medium md:not-sr-only">
                                                    {status.label}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                <td className="px-0 py-2">
                                    <button
                                        type="button"
                                        aria-label={`${product.name} — დეტალების ნახვა`}
                                        onClick={() => setSelected(product)}
                                        className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary transition hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                                    >
                                        <Icon
                                            icon="solar:menu-dots-bold"
                                            aria-hidden="true"
                                            className="h-5 w-5"
                                        />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onClose={() => setSelected(null)}
                onClick={(event) => {
                    if (event.target !== event.currentTarget) return;

                    const bounds = event.currentTarget.getBoundingClientRect();

                    if (
                        event.clientX < bounds.left ||
                        event.clientX > bounds.right ||
                        event.clientY < bounds.top ||
                        event.clientY > bounds.bottom
                    ) {
                        closeDetails();
                    }
                }}
                className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/25 backdrop:backdrop-blur-sm"
            >
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <h2
                        id={titleId}
                        className="text-base font-semibold"
                    >
                        პროდუქტის დეტალები
                    </h2>

                    <button
                        type="button"
                        autoFocus
                        aria-label="დეტალების დახურვა"
                        onClick={closeDetails}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-background focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        <Icon
                            icon="solar:close-circle-linear"
                            aria-hidden="true"
                            className="h-6 w-6"
                        />
                    </button>
                </div>

                {selected && (
                    <div className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                                {selected.imageUrl ? (
                                    <Image
                                        src={selected.imageUrl}
                                        alt={selected.name}
                                        fill
                                        sizes="64px"
                                        className="object-contain p-1"
                                    />
                                ) : (
                                    <Icon
                                        icon="solar:box-linear"
                                        aria-hidden="true"
                                        className="h-8 w-8 text-text-secondary"
                                    />
                                )}
                            </div>

                            <h3 className="min-w-0 break-words text-base font-semibold">
                                {selected.name}
                            </h3>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {getStatuses(selected).map((status) => (
                                <span
                                    key={status.label}
                                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${status.color}`}
                                >
                                    <Icon
                                        icon={status.icon}
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                    {status.label}
                                </span>
                            ))}
                        </div>

                        <dl className="mt-4 divide-y divide-border">
                            {details.map(([label, value]) => (
                                <div
                                    key={label}
                                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 py-2.5 text-sm"
                                >
                                    <dt className="text-text-secondary">
                                        {label}
                                    </dt>

                                    <dd className="min-w-0 break-all text-right font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>

                        {selected.description && (
                            <div className="mt-4 border-t border-border pt-3">
                                <p className="text-xs text-text-secondary">
                                    აღწერა
                                </p>

                                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                                    {selected.description}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </dialog>
        </>
    );
}