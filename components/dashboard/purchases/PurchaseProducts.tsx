"use client";

import { useId, useState, type ReactNode } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";

type PurchaseProduct = {
    id: string;
    name: string;
    imageUrl: string | null;
    category: string | null;
    brand: string | null;
    color: string | null;
    size: string | null;
    quantity: number;
    defectiveQuantity: number;
    defectNote: string | null;
    unitPurchasePrice: string;
    finalUnitCost: string;
};

type PurchaseProductsProps = {
    items: PurchaseProduct[];
    children: ReactNode;
    details?: ReactNode;
};

function formatMoney(value: string) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    const [integer, decimal] = amount.toFixed(2).split(".");
    const groupedInteger = integer.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        " ",
    );

    return `${groupedInteger}.${decimal} ₾`;
}

export default function PurchaseProducts({
    items,
    children,
    details,
}: PurchaseProductsProps) {
    const [open, setOpen] = useState(false);
    const contentId = useId();

    return (
        <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    {children}
                </div>

                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={contentId}
                    onClick={() => setOpen((previous) => !previous)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {open ? "დაკეცვა" : "პროდუქტების ნახვა"}

                    <Icon
                        icon="solar:alt-arrow-down-linear"
                        aria-hidden="true"
                        className={[
                            "h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
                            open ? "rotate-180" : "",
                        ].join(" ")}
                    />
                </button>
            </div>

            <div
                id={contentId}
                inert={!open}
                aria-hidden={!open}
                className={[
                    "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
                    open
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0",
                ].join(" ")}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="space-y-3 pt-4">
                        {items.map((item) => {
                            const attributes = [
                                item.category,
                                item.brand,
                                item.color,
                                item.size,
                            ]
                                .filter(Boolean)
                                .join(" · ");

                            return (
                                <div
                                    key={item.id}
                                    className="grid min-w-0 gap-4 rounded-xl border border-border bg-background p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:items-center"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                                            {item.imageUrl ? (
                                                <Image
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    width={48}
                                                    height={48}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Icon
                                                    icon="solar:box-bold-duotone"
                                                    className="h-6 w-6 text-text-secondary"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <h3 className="break-words text-sm font-semibold text-text-primary">
                                                {item.name}
                                            </h3>

                                            {attributes && (
                                                <p className="mt-1 break-words text-xs leading-relaxed text-text-secondary">
                                                    {attributes}
                                                </p>
                                            )}

                                            {item.defectiveQuantity > 0 && item.defectNote?.trim() && (
                                                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">
                                                    <span className="font-medium text-amber-600">
                                                        წუნის აღწერა:{" "}
                                                    </span>
                                                    {item.defectNote}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <dl className="grid min-w-0 gap-2 border-t border-border pt-3 sm:grid-cols-3 sm:gap-3 xl:border-t-0 xl:pt-0">
                                        <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                                            <dt className="text-xs text-text-secondary">
                                                შეძენილი რაოდენობა
                                            </dt>
                                            <dd className="text-sm font-semibold tabular-nums text-text-primary sm:mt-1">
                                                <span className="block break-words">
                                                    {String(item.quantity).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ცალი
                                                </span>

                                                {item.defectiveQuantity > 0 && (
                                                    <span className="mt-1 block text-xs font-medium text-amber-600">
                                                        აქედან წუნდებული:{" "}
                                                        {String(item.defectiveQuantity).replace(
                                                            /\B(?=(\d{3})+(?!\d))/g,
                                                            " ",
                                                        )}{" "}
                                                        ცალი
                                                    </span>
                                                )}
                                            </dd>
                                        </div>

                                        <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                                            <dt className="text-xs text-text-secondary">
                                                შესყიდვა / ცალი
                                            </dt>
                                            <dd className="break-words text-sm font-semibold tabular-nums text-text-primary sm:mt-1">
                                                {formatMoney(item.unitPurchasePrice)}
                                            </dd>
                                        </div>

                                        <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                                            <dt className="text-xs text-text-secondary">
                                                თვითღირებულება / ცალი
                                            </dt>
                                            <dd className="break-words text-sm font-semibold tabular-nums text-text-primary sm:mt-1">
                                                {formatMoney(item.finalUnitCost)}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            );
                        })}

                        {details}
                    </div>
                </div>
            </div>
        </div>
    );
}