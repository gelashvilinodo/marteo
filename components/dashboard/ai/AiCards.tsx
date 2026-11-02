"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@iconify/react";
import type { AiCardGroup, AiOrderCard, AiRestockSuggestion } from "@/lib/ai/ai-cards";
import { addPlanItem } from "@/lib/purchases/purchase-plan-client";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";
import type { InventoryProduct } from "@/components/dashboard/inventory/InventoryView";
import { number, payments, statuses } from "@/components/dashboard/orders/order-labels";
import type { AiRecordTarget } from "./AiRecordDialog";

// დეტალების ფანჯრები მხოლოდ ღილაკზე დაჭერისას იტვირთება.
const AiRecordDialog = dynamic(() => import("./AiRecordDialog"), { ssr: false });

const VISIBLE = 3;

const GROUPS = {
    orders: { more: "შეკვეთა", page: "/dashboard/orders", all: "ყველა შეკვეთა" },
    stock: { more: "პროდუქტი", page: "/dashboard/inventory", all: "მარაგების გვერდი" },
    customers: { more: "მომხმარებელი", page: "/dashboard/customers", all: "ყველა მომხმარებელი" },
} as const;

function money(value: string | null) {
    if (value === null) return "-";

    const [whole, cents = "00"] = Number(value).toFixed(2).split(".");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents} ₾`;
}

function day(value: string | null) {
    if (!value) return "-";

    const date = new Date(Date.parse(value) + 4 * 60 * 60 * 1000);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

function Thumb({ src, alt, icon }: { src: string | null; alt: string; icon: string }) {
    return (
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
            {src ? (
                <Image src={src} alt={alt} fill sizes="56px" unoptimized className="object-cover" />
            ) : (
                <Icon icon={icon} className="h-6 w-6 text-text-secondary" aria-hidden="true" />
            )}
        </div>
    );
}

function Pill({ label, icon, tone }: { label: string; icon: string; tone: string }) {
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
            <Icon icon={icon} className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
        </span>
    );
}

function DetailsButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${label} — დეტალურად`}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 text-xs font-medium text-accent transition hover:bg-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent"
        >
            დეტალურად
            <Icon icon="solar:arrow-right-up-linear" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
    );
}

const cardClass = "flex w-full gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm";

// რჩევის მიზეზი, კოდის მიერ დათვლილი ციფრებით.
function Note({ text }: { text?: string }) {
    if (!text) return null;

    return (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-accent/5 px-2 py-1.5 text-[11px] leading-snug text-text-primary">
            <Icon icon="solar:lightbulb-bolt-linear" className="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>{text}</span>
        </p>
    );
}

function RestockControl({ product, suggestion, planned, onPlanned }: {
    product: InventoryProduct;
    suggestion: AiRestockSuggestion;
    planned?: number;
    onPlanned: (quantity: number) => void;
}) {
    const [quantity, setQuantity] = useState(String(planned ?? suggestion.quantity));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const value = Number(quantity);
    const valid = Number.isSafeInteger(value) && value >= 1 && value <= 100_000;

    if (planned) {
        return (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success/10 px-2 py-1.5 text-xs text-success">
                <span className="inline-flex items-center gap-1 font-medium">
                    <Icon icon="solar:check-circle-bold" className="h-4 w-4" aria-hidden="true" />
                    შესაძენ სიაშია · {planned} ცალი
                </span>
                <Link href="/dashboard/purchases#purchase-plan" prefetch={false} className="font-medium underline-offset-2 hover:underline">
                    სიის ნახვა
                </Link>
            </div>
        );
    }

    async function add() {
        if (!valid || busy) return;

        setBusy(true);
        setError("");
        try {
            await addPlanItem({ inventoryItemId: product.id, quantity: value, reason: suggestion.reason, source: "AI" });
            onPlanned(value);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "სიაში დამატება ვერ მოხერხდა.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-2">
            <div className="flex items-center gap-1.5">
                <label className="flex h-8 items-center rounded-lg border border-border bg-background text-xs">
                    <span className="sr-only">რაოდენობა</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100000}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        className="h-full w-14 bg-transparent px-2 text-right text-[16px] tabular-nums text-text-primary outline-none lg:text-xs"
                    />
                    <span className="pr-2 text-text-secondary">ცალი</span>
                </label>
                <button
                    type="button"
                    onClick={() => void add()}
                    disabled={!valid || busy}
                    className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
                >
                    <Icon icon={busy ? "svg-spinners:180-ring" : "solar:cart-plus-linear"} className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">შესაძენ სიაში დამატება</span>
                </button>
            </div>
            {error && <p role="alert" className="mt-1 text-[11px] text-danger">{error}</p>}
        </div>
    );
}

function OrderCard({ order, note, onOpen }: { order: AiOrderCard; note?: string; onOpen: () => void }) {
    const status = statuses[order.status];
    const extra = order.productQuantity > 1 ? ` +${order.productQuantity - 1}` : "";

    return (
        <article className={cardClass}>
            <Thumb src={order.imageUrl} alt={order.title} icon="solar:box-linear" />
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">შეკვეთა {number(order)}</p>
                    <Pill {...status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {[order.customer, day(order.createdAt)].filter(Boolean).join(" · ")}
                </p>
                <p className="truncate text-xs text-text-primary">{order.title}{extra}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold tabular-nums text-text-primary">{money(order.total)}</p>
                        <p className="truncate text-[11px] text-text-secondary">{payments[order.paymentStatus]}</p>
                    </div>
                    <DetailsButton label={`შეკვეთა ${number(order)}`} onClick={onOpen} />
                </div>
                <Note text={note} />
            </div>
        </article>
    );
}

function stockStatus(product: InventoryProduct) {
    return product.goodStock === 0
        ? { label: "ამოწურული", icon: "solar:close-circle-linear", tone: "bg-danger/10 text-danger" }
        : product.goodStock < 5
            ? { label: "დაბალი მარაგი", icon: "solar:danger-triangle-linear", tone: "bg-warning/10 text-warning" }
            : { label: "მარაგშია", icon: "solar:check-circle-linear", tone: "bg-success/10 text-success" };
}

function StockCard({ product, note, restock, planned, onPlanned, onOpen }: {
    product: InventoryProduct;
    note?: string;
    restock?: AiRestockSuggestion;
    planned?: number;
    onPlanned: (quantity: number) => void;
    onOpen: () => void;
}) {
    const variant = [product.color, product.size].filter(Boolean).join(" · ");

    return (
        <article className={cardClass}>
            <Thumb src={product.imageUrl} alt={product.name} icon="solar:box-linear" />
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-tight text-text-primary">{product.name}</p>
                    <Pill {...stockStatus(product)} />
                </div>
                <p className="mt-0.5 truncate text-xs text-text-secondary">{variant || product.sku}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold tabular-nums text-text-primary">{product.goodStock} ცალი</p>
                        <p className="truncate text-[11px] text-text-secondary">
                            {product.defectiveStock > 0 ? `წუნდებული ${product.defectiveStock} · ` : ""}
                            ფასი {money(product.salePrice)}
                        </p>
                    </div>
                    <DetailsButton label={product.name} onClick={onOpen} />
                </div>
                <Note text={note} />
                {restock && <RestockControl product={product} suggestion={restock} planned={planned} onPlanned={onPlanned} />}
            </div>
        </article>
    );
}

function CustomerCard({ customer, note, onOpen }: { customer: CustomerEntry; note?: string; onOpen: () => void }) {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "უსახელო მომხმარებელი";
    const initials = [customer.firstName, customer.lastName].map((part) => part?.trim()[0] ?? "").join("") || "?";

    return (
        <article className={cardClass}>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-base font-semibold text-accent" aria-hidden="true">
                {initials}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                <p className="mt-0.5 truncate text-xs tabular-nums text-text-secondary">{customer.phone}</p>
                {customer.address && <p className="truncate text-xs text-text-secondary">{customer.address}</p>}
                <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">{customer.completedOrders} შეკვეთა</p>
                        <p className="truncate text-[11px] text-text-secondary">ბოლო: {day(customer.lastOrderAt)}</p>
                    </div>
                    <DetailsButton label={name} onClick={onOpen} />
                </div>
                <Note text={note} />
            </div>
        </article>
    );
}

function CardGroup({ group, onOpen, onPlanned }: {
    group: AiCardGroup;
    onOpen: (target: AiRecordTarget) => void;
    onPlanned: (id: string, quantity: number) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const hidden = group.items.length - VISIBLE;
    const visible = expanded ? group.items : group.items.slice(0, VISIBLE);
    const labels = GROUPS[group.kind];

    return (
        <div className="flex w-full flex-col gap-2">
            {group.kind === "orders" && (visible as AiOrderCard[]).map((item) => (
                <OrderCard key={item.id} order={item} note={group.notes?.[item.id]} onOpen={() => onOpen({ kind: "orders", item })} />
            ))}
            {group.kind === "stock" && (visible as InventoryProduct[]).map((item) => (
                <StockCard
                    key={item.id}
                    product={item}
                    note={group.notes?.[item.id]}
                    restock={group.restock?.[item.id]}
                    planned={group.planned?.[item.id]}
                    onPlanned={(quantity) => onPlanned(item.id, quantity)}
                    onOpen={() => onOpen({ kind: "stock", item })}
                />
            ))}
            {group.kind === "customers" && (visible as CustomerEntry[]).map((item) => (
                <CustomerCard key={item.id} customer={item} note={group.notes?.[item.id]} onOpen={() => onOpen({ kind: "customers", item })} />
            ))}

            {!expanded && hidden > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent/50 px-3 text-sm font-medium text-accent transition hover:bg-accent/5"
                >
                    <Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" aria-hidden="true" />
                    კიდევ {hidden} {labels.more}
                </button>
            )}

            {(expanded || hidden <= 0) && group.total > group.items.length && (
                <Link
                    href={labels.page}
                    prefetch={false}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-text-secondary transition hover:text-accent"
                >
                    ნაჩვენებია {group.items.length} / {group.total} — {labels.all}
                    <Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                </Link>
            )}
        </div>
    );
}

export default function AiCards({ groups, onChange }: {
    groups: AiCardGroup[];
    onChange: (groups: AiCardGroup[]) => void;
}) {
    const [target, setTarget] = useState<AiRecordTarget | null>(null);

    function updateOrder(card: AiOrderCard) {
        onChange(groups.map((group) => group.kind === "orders"
            ? { ...group, items: group.items.map((item) => item.id === card.id ? card : item) }
            : group));
    }

    function planned(id: string, quantity: number) {
        onChange(groups.map((group) => group.kind === "stock"
            ? { ...group, planned: { ...group.planned, [id]: quantity } }
            : group));
    }

    function remove(id: string) {
        onChange(groups
            .map((group) => ({
                ...group,
                total: group.items.some((item) => item.id === id) ? group.total - 1 : group.total,
                items: (group.items as { id: string }[]).filter((item) => item.id !== id),
            }) as AiCardGroup)
            .filter((group) => group.items.length > 0));
    }

    return (
        <div className="flex w-full flex-col gap-3">
            {groups.map((group) => <CardGroup key={group.kind} group={group} onOpen={setTarget} onPlanned={planned} />)}

            {target && (
                <AiRecordDialog
                    key={`${target.kind}:${target.item.id}`}
                    target={target}
                    onClose={() => setTarget(null)}
                    onOrderUpdated={updateOrder}
                    onRemoved={remove}
                />
            )}
        </div>
    );
}
