"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";
import ProductThumbnail from "@/components/shared/ProductThumbnail";
import InventoryPicker from "@/components/dashboard/purchases/Inventory/InventoryPicker";
import {
    addPlanItem,
    PURCHASE_FROM_PLAN,
    PURCHASE_PLAN_CHANGED,
    removePlanItem,
    updatePlanItem,
    type PurchaseFromPlanDetail,
    type PurchasePlanEntry,
} from "@/lib/purchases/purchase-plan-client";

type InventoryOption = Parameters<typeof InventoryPicker>[0]["options"][number];

function money(value: number) {
    const [whole, cents] = value.toFixed(2).split(".");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents} ₾`;
}

function validQuantity(value: string) {
    const quantity = Number(value);
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100_000 ? quantity : null;
}

async function loadPlan() {
    const response = await fetch("/api/purchase-plan", { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => null) as { success?: boolean; items?: PurchasePlanEntry[]; unavailable?: boolean; message?: string } | null;

    if (!response.ok || !body?.success || !Array.isArray(body.items)) {
        throw new Error(body?.message || "შესაძენი სია ვერ ჩაიტვირთა.");
    }

    return { items: body.items, unavailable: body.unavailable === true };
}

const noSubscription = () => () => undefined;

// შესაძენი სია: AI-ის რჩევებიდან ან ხელით დამატებული პროდუქტები შემდეგი პარტიისთვის.
export default function PurchasePlanSection({ inventoryOptions }: { inventoryOptions: InventoryOption[] }) {
    const [items, setItems] = useState<PurchasePlanEntry[] | null>(null);
    const [error, setError] = useState("");
    const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [pick, setPick] = useState<string | null>(null);
    const [pickQuantity, setPickQuantity] = useState("1");
    const [open, setOpen] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    // პროდუქტის ამრჩევი მხოლოდ ბრაუზერში იხატება: მისი დალაგება სერვერზე სხვაგვარად
    // გამოდის და hydration-ის შეცდომას იწვევდა.
    const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

    useEffect(() => {
        let active = true;

        function refresh() {
            loadPlan()
                .then((next) => {
                    if (!active) return;
                    setItems(next.items);
                    setUnavailable(next.unavailable);
                    setError("");
                })
                .catch((cause: unknown) => {
                    if (active) setError(cause instanceof Error ? cause.message : "შესაძენი სია ვერ ჩაიტვირთა.");
                });
        }

        refresh();
        window.addEventListener(PURCHASE_PLAN_CHANGED, refresh);
        return () => {
            active = false;
            window.removeEventListener(PURCHASE_PLAN_CHANGED, refresh);
        };
    }, []);

    async function run(key: string, action: () => Promise<unknown>) {
        setBusy(key);
        setError("");
        try {
            await action();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "შესაძენი სია ვერ განახლდა.");
        } finally {
            setBusy(null);
        }
    }

    function saveQuantity(item: PurchasePlanEntry) {
        const draft = drafts[item.id];
        if (draft === undefined) return;

        const quantity = validQuantity(draft);
        setDrafts((current) => {
            const next = { ...current };
            delete next[item.id];
            return next;
        });
        if (quantity === null || quantity === item.quantity) return;

        setItems((current) => current?.map((entry) => entry.id === item.id ? { ...entry, quantity } : entry) ?? current);
        void run(item.id, () => updatePlanItem(item.id, quantity));
    }

    const list = items ?? [];
    const chosen = list.filter((item) => !excluded.has(item.id));
    const priced = chosen.filter((item) => item.lastUnitPrice !== null);
    const estimate = priced.reduce((sum, item) => sum + Number(item.lastUnitPrice) * item.quantity, 0);
    const pickValue = validQuantity(pickQuantity);

    function createPurchase() {
        if (chosen.length === 0) return;

        const detail: PurchaseFromPlanDetail = {
            items: chosen.map((item) => ({ planItemId: item.id, inventoryItemId: item.inventoryItemId, quantity: item.quantity })),
        };
        window.dispatchEvent(new CustomEvent(PURCHASE_FROM_PLAN, { detail }));
    }

    return (
        <section id="purchase-plan" data-tour="purchase-plan" aria-labelledby="purchase-plan-title" className="mt-6 scroll-mt-24 rounded-2xl border border-border bg-surface">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-4 text-left"
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon icon="solar:checklist-minimalistic-bold-duotone" className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span id="purchase-plan-title" className="flex items-center gap-2 text-base font-semibold text-text-primary">
                        შესაძენი სია
                        {list.length > 0 && (
                            <span className="rounded-full bg-accent px-2 text-xs font-semibold leading-5 text-white">{list.length}</span>
                        )}
                    </span>
                    <span className="block text-xs text-text-secondary">პროდუქტები შემდეგი პარტიისთვის — მართეო AI-ის რჩევებიდან ან ხელით</span>
                </span>
                <Icon icon="solar:alt-arrow-down-linear" className={`h-5 w-5 shrink-0 text-text-secondary transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            <div
                id="purchase-plan-body"
                inert={!open}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
                <div className="min-h-0 overflow-hidden">
                <div className="border-t border-border p-4">
                    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

                    {unavailable ? (
                        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                            <Icon icon="solar:info-circle-linear" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            შესაძენი სია ჯერ არ არის ჩართული — ბაზას განახლება სჭირდება.
                        </p>
                    ) : items === null && !error ? (
                        <div role="status" aria-label="შესაძენი სია იტვირთება" className="animate-pulse space-y-2">
                            <div className="h-14 rounded-xl bg-background" />
                            <div className="h-14 rounded-xl bg-background" />
                        </div>
                    ) : list.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-text-secondary">
                            სია ცარიელია. დაამატეთ პროდუქტი ქვემოთ ან ჰკითხეთ მართეო AI-ს: „რა ვიყიდო შემდეგ პარტიაში?“
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {list.map((item) => {
                                const variant = [item.color, item.size].filter(Boolean).join(" · ");

                                return (
                                    <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0">
                                        <input
                                            type="checkbox"
                                            checked={!excluded.has(item.id)}
                                            onChange={() => setExcluded((current) => {
                                                const next = new Set(current);
                                                if (next.has(item.id)) next.delete(item.id);
                                                else next.add(item.id);
                                                return next;
                                            })}
                                            aria-label={`${item.name} — შესყიდვაში ჩართვა`}
                                            className="mt-3 h-4 w-4 shrink-0 accent-accent"
                                        />
                                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                                            {item.imageUrl ? (
                                                <ProductThumbnail src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
                                            ) : (
                                                <Icon icon="solar:box-linear" className="h-5 w-5 text-text-secondary" aria-hidden="true" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium text-text-primary">{item.name}</p>
                                            <p className="text-xs text-text-secondary">
                                                {[variant, `მარაგში ${item.goodStock}`, item.lastUnitPrice ? `ბოლო ფასი ${Number(item.lastUnitPrice).toFixed(2)} ₾` : null].filter(Boolean).join(" · ")}
                                            </p>
                                            {item.reason && (
                                                <p className="mt-1 flex gap-1 text-xs text-text-secondary">
                                                    {item.source === "AI" && <Icon icon="solar:stars-minimalistic-bold-duotone" className="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-label="მართეო AI-ის რჩევა" />}
                                                    <span className="line-clamp-2">{item.reason}</span>
                                                </p>
                                            )}
                                        </div>
                                        <label className="flex h-9 shrink-0 items-center rounded-lg border border-border bg-background text-xs">
                                            <span className="sr-only">{item.name} — რაოდენობა</span>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                max={100000}
                                                value={drafts[item.id] ?? String(item.quantity)}
                                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                                onBlur={() => saveQuantity(item)}
                                                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                                                className="h-full w-16 bg-transparent px-2 text-right text-[16px] tabular-nums text-text-primary outline-none lg:text-sm"
                                            />
                                            <span className="pr-2 text-text-secondary">ცალი</span>
                                        </label>
                                        <button
                                            type="button"
                                            disabled={busy === item.id}
                                            onClick={() => void run(item.id, async () => {
                                                await removePlanItem(item.id);
                                                setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? current);
                                            })}
                                            aria-label={`${item.name} — სიიდან ამოშლა`}
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                                        >
                                            <Icon icon="solar:trash-bin-trash-linear" className="h-[18px] w-[18px]" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {!unavailable && hydrated && (
                    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-background p-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                            <InventoryPicker options={inventoryOptions} value={pick} onChange={(id) => setPick(id || null)} />
                        </div>
                        <div className="flex gap-2">
                            <label className="flex h-9 items-center rounded-lg border border-border bg-surface text-xs">
                                <span className="sr-only">დასამატებელი რაოდენობა</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={100000}
                                    value={pickQuantity}
                                    onChange={(event) => setPickQuantity(event.target.value)}
                                    className="h-full w-16 bg-transparent px-2 text-right text-[16px] tabular-nums text-text-primary outline-none lg:text-sm"
                                />
                                <span className="pr-2 text-text-secondary">ცალი</span>
                            </label>
                            <button
                                type="button"
                                disabled={!pick || pickValue === null || busy === "add"}
                                onClick={() => void run("add", async () => {
                                    await addPlanItem({ inventoryItemId: pick!, quantity: pickValue!, source: "MANUAL" });
                                    setPick(null);
                                    setPickQuantity("1");
                                })}
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-sm font-medium text-accent transition hover:bg-accent/5 disabled:opacity-50"
                            >
                                <Icon icon="solar:add-circle-linear" className="h-4 w-4" aria-hidden="true" />
                                სიაში დამატება
                            </button>
                        </div>
                    </div>
                    )}

                    {list.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-text-secondary">
                                {priced.length > 0
                                    ? `სავარაუდო ღირებულება ბოლო ფასებით: ~${money(estimate)}${priced.length < chosen.length ? ` (${chosen.length - priced.length} პროდუქტს ფასი არ აქვს)` : ""}`
                                    : "ფასი შესყიდვის ფორმაში შეივსება."}
                            </p>
                            <button
                                type="button"
                                disabled={chosen.length === 0}
                                onClick={createPurchase}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-medium text-white transition hover:bg-success-hover disabled:opacity-50"
                            >
                                <Icon icon="solar:cart-large-2-bold-duotone" className="h-5 w-5" aria-hidden="true" />
                                შესყიდვის შექმნა ({chosen.length})
                            </button>
                        </div>
                    )}
                </div>
                </div>
            </div>
        </section>
    );
}
