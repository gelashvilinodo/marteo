"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import type { InventoryProduct } from "./InventoryView";

function formatQuantity(value: number) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatMoney(value: string | null) {
    if (value === null) return "-";

    const amount = Number(value);

    if (!Number.isFinite(amount)) return "-";

    return `${amount.toFixed(2)} ₾`;
}

function formatDate(value: string) {
    const [year, month, day] = value.slice(0, 10).split("-");

    return `${day}.${month}.${year}`;
}

export function getStatuses(product: InventoryProduct) {
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

// პროდუქტის დეტალების ფანჯარა — მარაგების გვერდზე და მართეო AI-ში.
export default function InventoryProductDetails({
    product,
    onClose,
    onEdit,
    onDelete,
}: {
    product: InventoryProduct | null;
    onClose: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!product) return;

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
    }, [product]);

    function closeDetails() {
        dialogRef.current?.close();
    }

    const details = product
        ? [
            ["ბრენდი", product.brand || "-"],
            ["კატეგორია", product.category || "-"],
            ["SKU", product.sku],
            ["ფერი", product.color || "-"],
            ["ზომა", product.size || "-"],
            ["სულ დარჩენილი", `${formatQuantity(product.totalStock)} პროდუქტი`],
            ["რეალიზებადი", `${formatQuantity(product.goodStock)} პროდუქტი`],
            ["წუნდებული", `${formatQuantity(product.defectiveStock)} პროდუქტი`],
            [
                "საშუალო თვითღირებულება",
                product.totalStock > 0 &&
                product.averageUnitCost === null
                    ? "უცნობია"
                    : formatMoney(product.averageUnitCost),
            ],
            ["გასაყიდი ფასი", formatMoney(product.salePrice)],
            ["დამატების თარიღი", formatDate(product.createdAt)],
        ]
        : [];

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            // StrictMode ფანჯარას ხურავს და ხელახლა ხსნის; დაგვიანებული close აღარ ითვლება.
            onClose={(event) => { if (!event.currentTarget.open) onClose(); }}
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

            {product && (
                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                            {product.imageUrl ? (
                                <Image
                                    src={product.imageUrl}
                                    alt={product.name}
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
                            {product.name}
                        </h3>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {getStatuses(product).map((status) => (
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

                    <button
                        type="button"
                        onClick={() => {
                            const id = product.id;

                            // ჯერ დეტალების ფანჯარა დაიხუროს,
                            // შემდეგ გაიხსნას რედაქტირება (close სინქრონულია).
                            closeDetails();
                            onEdit(id);
                        }}
                        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent"
                    >
                        <Icon
                            icon="solar:pen-linear"
                            className="h-5 w-5"
                            aria-hidden="true"
                        />
                        რედაქტირება
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            const id = product.id;
                            closeDetails();
                            onDelete(id);
                        }}
                        className="delete-action mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium"
                    >
                        <Icon
                            icon="solar:trash-bin-trash-linear"
                            className="h-5 w-5"
                            aria-hidden="true"
                        />
                        წაშლა
                    </button>

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

                    {product.description && (
                        <div className="mt-4 border-t border-border pt-3">
                            <p className="text-xs text-text-secondary">
                                აღწერა
                            </p>

                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                                {product.description}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </dialog>
    );
}
