"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventoryPageData, InventoryFilter as Filter, InventoryControls as Controls, InventorySort as Sort } from "@/lib/inventory/get-inventory-page";
import { Icon } from "@iconify/react";

import InventoryFiltersDisclosure from "@/components/dashboard/inventory/InventoryFiltersDisclosure";
import InventoryProducts from "@/components/dashboard/inventory/InventoryProducts";
import InventoryChart from "@/components/dashboard/inventory/InventoryChart";
import InventoryPagination from "@/components/dashboard/inventory/InventoryPagination";

import LatestInventoryMovements, {
    type InventoryMovementEntry,
} from "@/components/dashboard/inventory/LatestInventoryMovements";

export type InventoryProduct = {
    id: string;
    createdAt: string;
    sku: string;
    description: string | null;
    salePrice: string | null;
    name: string;
    brand: string | null;
    category: string | null;
    color: string | null;
    size: string | null;
    imageUrl: string | null;
    totalStock: number;
    goodStock: number;
    defectiveStock: number;
    goodStockValueCents: string;
};

const DEFAULT_CONTROLS: Controls = {
    query: "",
    category: "",
    color: "",
    size: "",
    sort: "name-asc",
};

const filterOptions: {
    id: Filter;
    title: string;
    icon: string;
    iconClass: string;
    selectedClass: string;
}[] = [
        {
            id: "all",
            title: "სულ მარაგში",
            icon: "solar:box-linear",
            iconClass: "bg-success/10 text-success",
            selectedClass: "border-success bg-success/5",
        },
        {
            id: "low",
            title: "დაბალი მარაგი",
            icon: "solar:danger-triangle-linear",
            iconClass: "bg-warning/10 text-warning",
            selectedClass: "border-warning bg-warning/5",
        },
        {
            id: "exhausted",
            title: "ამოწურული მარაგი",
            icon: "solar:box-minimalistic-linear",
            iconClass: "bg-danger/10 text-danger",
            selectedClass: "border-danger bg-danger/5",
        },
        {
            id: "defective",
            title: "წუნდებული მარაგში",
            icon: "solar:shield-warning-linear",
            iconClass: "bg-accent/10 text-accent",
            selectedClass: "border-accent bg-accent/5",
        },
    ];

function formatQuantity(value: number) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export default function InventoryView({
    data,
    movements,
}: {
    data: InventoryPageData;
    movements: InventoryMovementEntry[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const { filter, currentPage, totalPages, totalProducts, products: pageProducts } = data;
    const appliedControls = data.controls;
    const [controls, setControls] = useState<Controls>(appliedControls);
    const controlsKey = JSON.stringify(appliedControls);
    const [previousControlsKey, setPreviousControlsKey] = useState(controlsKey);
    if (previousControlsKey !== controlsKey) {
        setPreviousControlsKey(controlsKey);
        setControls(appliedControls);
    }
    const { categories, colors, sizes } = data.options;
    const hasFilters = Boolean(
        appliedControls.query || appliedControls.category || appliedControls.color ||
        appliedControls.size || appliedControls.sort !== "name-asc",
    );
    const inputClass =
        "block h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent lg:text-sm";

    function navigate(nextFilter: Filter, nextControls: Controls, nextPage = 1) {
        const params = new URLSearchParams();
        if (nextFilter !== "all") params.set("status", nextFilter);
        if (nextControls.query.trim()) params.set("q", nextControls.query.trim());
        if (nextControls.category) params.set("category", nextControls.category);
        if (nextControls.color) params.set("color", nextControls.color);
        if (nextControls.size) params.set("size", nextControls.size);
        if (nextControls.sort !== "name-asc") params.set("sort", nextControls.sort);
        if (nextPage > 1) params.set("page", String(nextPage));
        const query = params.toString();
        router.push(`/dashboard/inventory${query ? `?${query}` : ""}`, { scroll: false });
    }
    function clearControls() {
        setControls(DEFAULT_CONTROLS);
        startTransition(() => navigate(filter, DEFAULT_CONTROLS));
    }
    const cards = filterOptions.map((option) => ({ ...option, ...data.counts[option.id] }));

    const listTitle =
        filter === "low"
            ? "დაბალი მარაგის პროდუქტები"
            : filter === "exhausted"
                ? "ამოწურული პროდუქტები"
                : filter === "defective"
                    ? "წუნდებული პროდუქტები"
                    : "პროდუქტები";

    return (
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto min-w-0 max-w-7xl">
                <h1 className="text-2xl font-semibold text-text-primary">
                    მარაგები
                </h1>

                <div
                    aria-label="მარაგის ფილტრები"
                    className="mt-6 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
                >
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            disabled={pending}
                            aria-pressed={filter === card.id}
                            aria-controls="inventory-products"
                            onClick={() => {
                                startTransition(() => navigate(card.id, appliedControls));
                            }}
                            className={[
                                "min-w-0 rounded-2xl border p-3 text-left transition-colors sm:p-4",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                                filter === card.id
                                    ? card.selectedClass
                                    : "border-border bg-surface hover:bg-background",
                            ].join(" ")}
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <span
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
                                >
                                    <Icon
                                        icon={card.icon}
                                        aria-hidden="true"
                                        className="h-5 w-5"
                                    />
                                </span>

                                <span className="min-w-0 text-sm font-medium text-text-secondary">
                                    {card.title}
                                </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="break-words text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                    {formatQuantity(card.species)} სახეობა
                                </span>

                                <span className="text-xs tabular-nums text-text-secondary sm:text-sm">
                                    ({formatQuantity(card.quantity)} პროდუქტი)
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
                    <section
                        id="inventory-products"
                        aria-busy={pending}
                        className="min-w-0 scroll-mt-20 rounded-2xl border border-border bg-surface"
                    >
                        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 sm:p-5">
                            <Icon
                                icon="solar:box-linear"
                                aria-hidden="true"
                                className="h-5 w-5 shrink-0 text-accent"
                            />

                            <h2 className="text-base font-semibold text-text-primary sm:text-lg">
                                {listTitle}
                            </h2>

                            <span
                                aria-live="polite"
                                aria-atomic="true"
                                className="ml-auto text-sm tabular-nums text-text-secondary"
                            >
                                {formatQuantity(totalProducts)} სახეობა
                                {pending && <Icon icon="solar:refresh-linear" className="ml-2 inline-block h-4 w-4 animate-spin text-accent" aria-label="იტვირთება" />}
                            </span>
                        </div>

                        <div className="px-3 pb-4 sm:px-4">
                            <InventoryFiltersDisclosure
                                defaultOpen={false}
                                hasFilters={hasFilters}
                            >
                                <form
                                    aria-busy={pending}
                                    onSubmit={(event) => {
                                        event.preventDefault();

                                        startTransition(() => navigate(filter, controls));
                                    }}
                                    className="border-t border-border p-3 sm:p-4"
                                >
                                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:items-end">
                                        <label className="block min-w-0 sm:col-span-2 xl:col-span-2">
                                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                                                ძებნა
                                            </span>

                                            <input
                                                type="search"
                                                value={controls.query}
                                                onChange={(event) =>
                                                    setControls((previous) => ({
                                                        ...previous,
                                                        query: event.target.value,
                                                    }))
                                                }
                                                placeholder="სახელი, ბრენდი, ფერი ან ზომა"
                                                className={inputClass}
                                            />
                                        </label>

                                        <label className="block min-w-0">
                                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                                                კატეგორია
                                            </span>

                                            <select
                                                value={controls.category}
                                                onChange={(event) =>
                                                    setControls((previous) => ({
                                                        ...previous,
                                                        category: event.target.value,
                                                    }))
                                                }
                                                className={inputClass}
                                            >
                                                <option value="">ყველა კატეგორია</option>

                                                {categories.map((category) => (
                                                    <option key={category} value={category}>
                                                        {category}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block min-w-0">
                                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                                                ფერი
                                            </span>

                                            <select
                                                value={controls.color}
                                                onChange={(event) =>
                                                    setControls((previous) => ({
                                                        ...previous,
                                                        color: event.target.value,
                                                    }))
                                                }
                                                className={inputClass}
                                            >
                                                <option value="">ყველა ფერი</option>

                                                {colors.map((color) => (
                                                    <option key={color} value={color}>
                                                        {color}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block min-w-0">
                                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                                                ზომა
                                            </span>

                                            <select
                                                value={controls.size}
                                                onChange={(event) =>
                                                    setControls((previous) => ({
                                                        ...previous,
                                                        size: event.target.value,
                                                    }))
                                                }
                                                className={inputClass}
                                            >
                                                <option value="">ყველა ზომა</option>

                                                {sizes.map((size) => (
                                                    <option key={size} value={size}>
                                                        {size}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block min-w-0">
                                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                                                სორტირება
                                            </span>

                                            <select
                                                value={controls.sort}
                                                onChange={(event) =>
                                                    setControls((previous) => ({
                                                        ...previous,
                                                        sort: event.target.value as Sort,
                                                    }))
                                                }
                                                className={inputClass}
                                            >
                                                <option value="name-asc">სახელი · ა–ჰ</option>
                                                <option value="name-desc">სახელი · ჰ–ა</option>
                                                <option value="quantity-asc">
                                                    რაოდენობა · ზრდადობით
                                                </option>
                                                <option value="quantity-desc">
                                                    რაოდენობა · კლებადობით
                                                </option>
                                                <option value="date-desc">
                                                    დამატების თარიღი · ახალი პირველი
                                                </option>
                                                <option value="date-asc">
                                                    დამატების თარიღი · ძველი პირველი
                                                </option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                                        {hasFilters && (
                                            <button
                                                type="button"
                                                onClick={clearControls}
                                                className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-secondary underline underline-offset-4 hover:text-accent"
                                            >
                                                <Icon
                                                    icon="solar:restart-linear"
                                                    aria-hidden="true"
                                                    className="h-4 w-4"
                                                />
                                                გასუფთავება
                                            </button>
                                        )}

                                        <button
                                            type="submit"
                                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white transition hover:bg-accent-hover sm:w-auto"
                                        >
                                            <Icon
                                                icon="solar:magnifer-linear"
                                                aria-hidden="true"
                                                className="h-4 w-4"
                                            />
                                            ძებნა
                                        </button>
                                    </div>
                                </form>
                            </InventoryFiltersDisclosure>
                        </div>

                        {totalProducts === 0 ? (
                            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                                <Icon
                                    icon="solar:box-linear"
                                    aria-hidden="true"
                                    className="h-10 w-10 text-text-secondary"
                                />
                                <p className="text-sm text-text-secondary">
                                    {data.counts.all.species === 0
                                        ? "ჩამოსული პროდუქცია ჯერ არ არის."
                                        : "შერჩეულ პირობებს პროდუქტი არ შეესაბამება."}
                                </p>
                            </div>
                        ) : (
                            <InventoryProducts
                                products={pageProducts}
                                showDefective={filter === "defective"}
                            />
                        )}

                        <InventoryPagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={(page) => navigate(filter, appliedControls, page)}
                        />

                    </section>

                    <div className="min-w-0 space-y-4">
                        <InventoryChart data={data.chart} />

                        <LatestInventoryMovements movements={movements} />
                    </div>
                </div>
            </div>
        </main>
    );
}