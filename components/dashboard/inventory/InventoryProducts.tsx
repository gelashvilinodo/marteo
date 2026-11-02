"use client";

import ProductThumbnail from "@/components/shared/ProductThumbnail";

import { useState } from "react";
import { Icon } from "@iconify/react";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import type { InventoryProduct } from "./InventoryView";
import InventoryProductDetails, { getStatuses } from "./InventoryProductDetails";

const InventoryEditDialog = dynamic(
    () => import("./InventoryEditDialog"),
    { ssr: false },
);

const InventoryDeleteDialog = dynamic(
    () => import("./InventoryDeleteDialog"),
    { ssr: false },
);

type Props = {
    products: InventoryProduct[];
    showDefective: boolean;
};

function formatQuantity(value: number) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export default function InventoryProducts({
    products,
    showDefective,
}: Props) {
    const [selected, setSelected] = useState<InventoryProduct | null>(null);
    const router = useRouter();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
                            className="w-[19%] px-2 py-3 text-center font-medium md:text-left"
                        >
                            სტატუსი
                        </th>

                        <th
                            scope="col"
                            className="w-14 px-1 py-3"
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
                                                <ProductThumbnail
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
                                    {product.category || "-"}
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
                                        .join(" · ") || "-"}
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
                                    <div className="flex min-w-0 flex-wrap justify-center gap-1 md:justify-start">
                                        {getStatuses(product).map((status) => (
                                            <span
                                                key={status.label}
                                                title={status.label}
                                                className={[
                                                    "inline-flex h-6 w-6 min-w-0 max-w-full items-center justify-center rounded-lg",
                                                    "md:h-auto md:w-auto md:gap-1 md:px-2 md:py-1",
                                                    status.color,
                                                ].join(" ")}
                                            >
                                                <Icon
                                                    icon={status.icon}
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 shrink-0"
                                                />

                                                <span className="sr-only text-[11px] font-medium md:not-sr-only md:min-w-0 md:whitespace-normal md:leading-4 md:[overflow-wrap:anywhere]">
                                                    {status.label}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                <td className="px-0 py-2">
                                    <button
                                        type="button"
                                        aria-label={`${product.name} - დეტალების ნახვა`}
                                        onClick={() => setSelected(product)}
                                        className="mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
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

            <InventoryProductDetails
                product={selected}
                onClose={() => setSelected(null)}
                onEdit={(id) => setEditingId(id)}
                onDelete={(id) => setDeletingId(id)}
            />
            {editingId && (
                <InventoryEditDialog
                    key={editingId}
                    inventoryItemId={editingId}
                    onClose={() => setEditingId(null)}
                    onSaved={() => {
                        setEditingId(null);
                        router.refresh();
                    }}
                />
            )}
            {deletingId && (
                <InventoryDeleteDialog
                    key={deletingId}
                    inventoryItemId={deletingId}
                    onClose={() => setDeletingId(null)}
                    onDeleted={() => {
                        setDeletingId(null);
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}