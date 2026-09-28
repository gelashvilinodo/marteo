"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

type InventoryOption = {
    id: string;
    name: string;
    brand: string;
    category: string;
    sku: string;
    color: string;
    size: string;
    imageUrl: string;
    currentStock: number;
};

type Props = {
    options: InventoryOption[];
    value: string | null;
    onChange: (id: string) => void;
};

const controlClass =
    "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-text-primary outline-none focus:border-accent";

function normalize(value: string) {
    return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ka"),
    );
}

export default function InventoryPicker({
    options,
    value,
    onChange,
}: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const titleId = useId();

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [color, setColor] = useState("");
    const [size, setSize] = useState("");
    const [stockOnly, setStockOnly] = useState(false);
    const [sort, setSort] = useState("name");
    const [limit, setLimit] = useState(30);

    const selected = options.find((item) => item.id === value);

    const categories = unique(options.map((item) => item.category));
    const colors = unique(options.map((item) => item.color));
    const sizes = unique(options.map((item) => item.size));

    const words = normalize(search).split(/\s+/).filter(Boolean);

    const filtered = options
        .filter((item) => {
            const text = normalize(
                [
                    item.name,
                    item.brand,
                    item.category,
                    item.sku,
                    item.color,
                    item.size,
                ].join(" "),
            );

            return (
                words.every((word) => text.includes(word)) &&
                (!category || item.category === category) &&
                (!color || item.color === color) &&
                (!size || item.size === size) &&
                (!stockOnly || item.currentStock > 0)
            );
        })
        .sort((a, b) => {
            const byName =
                a.name.localeCompare(b.name, "ka") ||
                a.sku.localeCompare(b.sku, "ka");

            if (sort === "stock-desc") {
                return b.currentStock - a.currentStock || byName;
            }

            if (sort === "stock-asc") {
                return a.currentStock - b.currentStock || byName;
            }

            if (sort === "name-desc") {
                return -byName;
            }

            return byName;
        });

    function resetFilters() {
        setSearch("");
        setCategory("");
        setColor("");
        setSize("");
        setStockOnly(false);
        setSort("name");
        setLimit(30);
    }

    function openPicker() {
        resetFilters();
        dialogRef.current?.showModal();
        searchRef.current?.focus({ preventScroll: true });
    }

    function choose(id: string) {
        onChange(id);
        dialogRef.current?.close();
    }

    function resetProduct() {
        if (
            window.confirm(
                "გადახვიდე ახალ პროდუქტზე? ამ ბარათში შევსებული მონაცემები გასუფთავდება.",
            )
        ) {
            onChange("");
        }
    }

    return (
        <>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-[1_1_120px] break-words text-xs font-medium">
                    {selected
                        ? [selected.name, selected.color, selected.size]
                              .filter(Boolean)
                              .join(" · ")
                        : "ახალი პროდუქტი"}
                </span>

                <button
                    type="button"
                    data-inventory-picker
                    aria-haspopup="dialog"
                    onClick={openPicker}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-success px-2.5 text-xs font-medium text-success transition hover:bg-success/10 lg:h-8"
                >
                    <Icon
                        icon="solar:box-linear"
                        className="h-4 w-4"
                    />
                    მარაგიდან არჩევა
                </button>

                {selected && (
                    <button
                        type="button"
                        onClick={resetProduct}
                        aria-label="ახალ პროდუქტზე გადასვლა"
                        title="ახალ პროდუქტზე გადასვლა"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background"
                    >
                        <Icon
                            icon="solar:restart-linear"
                            className="h-4 w-4"
                        />
                    </button>
                )}
            </div>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onKeyDown={(event) => event.stopPropagation()}
                onCancel={(event) => event.stopPropagation()}
                className="fixed inset-0 m-auto w-[calc(100%-1rem)] max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/40"
            >
                <div className="flex max-h-[85dvh] flex-col">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <h3 id={titleId} className="text-sm font-semibold">
                            მარაგიდან არჩევა
                        </h3>

                        <button
                            type="button"
                            onClick={() => dialogRef.current?.close()}
                            aria-label="ფანჯრის დახურვა"
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-background"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-5 w-5"
                            />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                        <input
                            ref={searchRef}
                            type="search"
                            aria-label="პროდუქტის ძებნა"
                            placeholder="სახელი, ბრენდი, კოდი..."
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setLimit(30);
                            }}
                            className={`${controlClass} h-10`}
                        />

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <select
                                aria-label="კატეგორიის ფილტრი"
                                value={category}
                                onChange={(event) => {
                                    setCategory(event.target.value);
                                    setLimit(30);
                                }}
                                className={controlClass}
                            >
                                <option value="">ყველა კატეგორია</option>
                                {categories.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>

                            <select
                                aria-label="ფერის ფილტრი"
                                value={color}
                                onChange={(event) => {
                                    setColor(event.target.value);
                                    setLimit(30);
                                }}
                                className={controlClass}
                            >
                                <option value="">ყველა ფერი</option>
                                {colors.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>

                            <select
                                aria-label="ზომის ფილტრი"
                                value={size}
                                onChange={(event) => {
                                    setSize(event.target.value);
                                    setLimit(30);
                                }}
                                className={controlClass}
                            >
                                <option value="">ყველა ზომა</option>
                                {sizes.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>

                            <select
                                aria-label="სორტირება"
                                value={sort}
                                onChange={(event) => {
                                    setSort(event.target.value);
                                    setLimit(30);
                                }}
                                className={controlClass}
                            >
                                <option value="name">სახელით · ა–ჰ</option>
                                <option value="name-desc">სახელით · ჰ–ა</option>
                                <option value="stock-desc">რაოდენობით · მეტი</option>
                                <option value="stock-asc">რაოდენობით · ნაკლები</option>
                            </select>
                        </div>

                        <div className="my-3 flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={stockOnly}
                                    onChange={(event) => {
                                        setStockOnly(event.target.checked);
                                        setLimit(30);
                                    }}
                                    className="accent-success"
                                />
                                მხოლოდ დადებითი ნაშთი
                            </label>

                            <button
                                type="button"
                                onClick={resetFilters}
                                className="text-xs text-text-secondary underline underline-offset-4"
                            >
                                ფილტრების გასუფთავება
                            </button>
                        </div>

                        <p
                            role="status"
                            className="mb-2 text-xs text-text-secondary"
                        >
                            {filtered.length} ვარიანტი
                        </p>

                        {filtered.length === 0 ? (
                            <p className="py-8 text-center text-sm text-text-secondary">
                                {options.length === 0
                                    ? "მარაგში პროდუქტები ჯერ არ არის"
                                    : "პროდუქტი ვერ მოიძებნა"}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {filtered.slice(0, limit).map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => choose(item.id)}
                                        className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-success hover:bg-success/5 focus-visible:outline-2 focus-visible:outline-success"
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                                            {item.imageUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={item.imageUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Icon
                                                    icon="solar:box-bold-duotone"
                                                    className="h-6 w-6 text-text-secondary"
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium">
                                                {item.name}
                                            </p>

                                            <p className="mt-1 break-words text-xs text-text-secondary">
                                                {[
                                                    item.category,
                                                    item.brand,
                                                    item.color,
                                                    item.size,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>

                                            <p className="mt-1 text-xs text-text-secondary">
                                                მარაგი: {item.currentStock} ცალი
                                            </p>
                                        </div>

                                        {value === item.id && (
                                            <Icon
                                                icon="solar:check-circle-bold"
                                                className="h-5 w-5 shrink-0 text-success"
                                            />
                                        )}
                                    </button>
                                ))}

                                {filtered.length > limit && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setLimit((current) => current + 30)
                                        }
                                        className="h-10 w-full rounded-lg text-sm font-medium text-accent hover:bg-accent/10"
                                    >
                                        მეტის ჩვენება
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </dialog>
        </>
    );
}