"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Icon } from "@iconify/react";
import type { OrderEntry, OrdersFilter, OrdersPageData, OrdersSort, OrdersPaymentFilter } from "@/lib/orders/get-orders-page";
import type { OrdersPeriod } from "@/lib/orders/orders-period";
import NewOrderButton from "./NewOrderButton";
import OrderEditButton from "./OrderEditButton";
import OrdersPagination from "./OrdersPagination";
import InventoryFiltersDisclosure from "@/components/dashboard/inventory/InventoryFiltersDisclosure";
import OrderInvoiceButton from "./OrderInvoiceButton";
import OrderReturnButton from "./OrderReturnButton";
import OrderDeleteButton from "./OrderDeleteButton";
import OrderBulkDeleteButton from "./OrderBulkDeleteButton";
import OrderRefundButton from "./OrderRefundButton";
import OrdersListSkeleton from "./OrdersListSkeleton";

import {
    OrderActionError,
    sendOrderAction,
} from "@/lib/orders/order-actions-client";

const cards = [
    { id: "all", title: "სულ შეკვეთები", icon: "solar:clipboard-list-linear", tone: "text-accent bg-accent/10", selected: "border-accent bg-accent/5" },
    { id: "processing", title: "მუშავდება", icon: "solar:clock-circle-linear", tone: "text-warning bg-warning/10", selected: "border-warning bg-warning/5" },
    {
        id: "shipped",
        title: "გაგზავნილი",
        icon: "solar:delivery-linear",
        tone: "text-accent bg-accent/10",
        selected: "border-accent bg-accent/5",
    },
    { id: "completed", title: "დასრულებული", icon: "solar:check-circle-linear", tone: "text-success bg-success/10", selected: "border-success bg-success/5" },
    { id: "canceled", title: "გაუქმებული", icon: "solar:close-circle-linear", tone: "text-danger bg-danger/10", selected: "border-danger bg-danger/5" },
] as const;

const statuses = {
    PROCESSING: { label: "მუშავდება", icon: "solar:clock-circle-linear", tone: "text-warning bg-warning/10" },
    SHIPPED: {
        label: "გაგზავნილი",
        icon: "solar:delivery-linear",
        tone: "text-accent bg-accent/10",
    },
    COMPLETED: { label: "დასრულებული", icon: "solar:check-circle-linear", tone: "text-success bg-success/10" },
    CANCELED: { label: "გაუქმებული", icon: "solar:close-circle-linear", tone: "text-danger bg-danger/10" },
    RETURNED: {
        label: "დაბრუნებული",
        icon: "solar:undo-left-round-linear",
        tone: "text-accent bg-accent/10",
    },
};
const payments = {
    PAID: "გადახდილი",
    UNPAID: "გადაუხდელი",
    PARTIALLY_PAID: "ნაწილობრივ",
    COURIER_ONLY_PAID: "მხოლოდ კურიერი",
};
const methods = { CASH: "ნაღდი", BANK_TRANSFER: "გადარიცხვა", CARD: "ბარათი" };

function number(value: OrderEntry) {
    return value.number !== null ? `#${String(value.number).padStart(4, "0")}` : `#${value.id.slice(-6)}`;
}
function recipient(value: OrderEntry) {
    return [value.recipientFirstName, value.recipientLastName].filter(Boolean).join(" ") || "მიმღები";
}
function date(value: string) {
    const d = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function Status({
    order,
    onReturn,
}: {
    order: OrderEntry;
    onReturn: (orderId: string) => void;
}) {
    const router = useRouter();
    const [refreshing, startRefresh] = useTransition();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [current, setCurrent] = useState({
        status: order.status,
        version: order.invoiceVersion,
    });

    const retry = useRef<Record<string, unknown> | null>(null);
    const running = useRef(false);

    useEffect(() => {
        setCurrent({
            status: order.status,
            version: order.invoiceVersion,
        });
    }, [order.status, order.invoiceVersion]);

    const allowed: Record<
        OrderEntry["status"],
        OrderEntry["status"][]
    > = {
        PROCESSING: ["SHIPPED", "COMPLETED", "CANCELED"],
        SHIPPED: ["COMPLETED", "CANCELED"],
        COMPLETED: [],
        CANCELED: [],
        RETURNED: [],
    };

    const canManageReturn =
        order.hasReturnHistory ||
        order.hasPastReturns ||
        (
            !order.stockReturnedAt &&
            ["SHIPPED", "COMPLETED", "CANCELED", "RETURNED"]
                .includes(current.status)
        );

    const status = statuses[current.status];

    const canCompleteAfterReturn =
        current.status === "SHIPPED" &&
        order.pendingReturnQuantity === 0 &&
        !order.deleteRequestedAt &&
        !order.stockReturnedAt;

    const availableStatuses = order.hasReturnHistory
        ? canCompleteAfterReturn
            ? ["COMPLETED" as const]
            : []
        : allowed[current.status];

    async function save(payload: Record<string, unknown>) {
        if (running.current) return;

        running.current = true;
        setBusy(true);
        setError("");

        try {
            const result = await sendOrderAction(
                order.id,
                "status",
                payload,
            );

            retry.current = null;
            setCurrent({
                status: payload.status as OrderEntry["status"],
                version: result.version,
            });

            startRefresh(() => router.refresh());
        } catch (cause: unknown) {
            const definiteFailure =
                cause instanceof OrderActionError &&
                cause.status < 500;

            retry.current = definiteFailure ? null : payload;

            setError(
                definiteFailure
                    ? cause.message
                    : "შედეგი დაუდასტურებელია. დააჭირე ხელახლა ცდას.",
            );

            if (
                cause instanceof OrderActionError &&
                cause.status === 409
            ) {
                startRefresh(() => router.refresh());
            }
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    function change(next: OrderEntry["status"]) {
        if (
            next === current.status ||
            busy ||
            refreshing ||
            retry.current
        ) return;

        if (
            next === "COMPLETED" &&
            !window.confirm(
                "დასრულების შემდეგ შეკვეთის რედაქტირება აღარ იქნება შესაძლებელი. გადაამოწმე მონაცემები. დაასრულო შეკვეთა?",
            )
        ) return;

        let stockReturned = false;

        if (next === "CANCELED") {
            if (!window.confirm("გააუქმო შეკვეთა?")) return;

            if (current.status === "SHIPPED") {
                stockReturned = window.confirm(
                    "პროდუქტები ფიზიკურად დაბრუნდა? OK — დაბრუნდა და მარაგს დაემატოს; Cancel — ჯერ არ დაბრუნებულა.",
                );
            }
        }

        void save({
            requestId: crypto.randomUUID(),
            expectedVersion: current.version,
            status: next,
            confirmCompleted: next === "COMPLETED",
            stockReturned,
        });
    }

    return (
        <div className="min-w-0">
            <div
                className={`relative inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 ${status.tone}`}
            >
                <Icon
                    icon={
                        busy || refreshing
                            ? "solar:refresh-linear"
                            : status.icon
                    }
                    className={`h-4 w-4 shrink-0 ${busy || refreshing ? "animate-spin" : ""
                        }`}
                />

                <span className="hidden text-xs font-medium sm:inline">
                    {status.label}
                </span>

                <span className="sr-only sm:hidden">
                    {status.label}
                </span>

                {(availableStatuses.length > 0 || canManageReturn) && (
                    <>
                        <Icon
                            icon="solar:alt-arrow-down-linear"
                            className="h-3.5 w-3.5 shrink-0"
                        />

                        <select
                            aria-label={`შეკვეთა ${number(order)} — სტატუსის შეცვლა`}
                            value={current.status}
                            disabled={
                                busy ||
                                refreshing ||
                                Boolean(retry.current)
                            }
                            onChange={event => {
                                const value = event.target.value;

                                if (value === "RETURN_ACTION") {
                                    event.target.value = current.status;
                                    onReturn(order.id);
                                    return;
                                }

                                change(value as OrderEntry["status"]);
                            }}
                            className="absolute inset-0 h-full w-full cursor-pointer text-[16px] opacity-0 disabled:cursor-wait"
                        >
                            <option value={current.status}>
                                {status.label}
                            </option>

                            {availableStatuses.map(value => (
                                <option key={value} value={value}>
                                    {statuses[value].label}
                                </option>
                            ))}

                            {canManageReturn && (
                                <option value="RETURN_ACTION">
                                    დაბრუნება / დაბრუნების მართვა
                                </option>
                            )}
                        </select>
                    </>
                )}
            </div>

            {error && (
                <p
                    role="alert"
                    className="mt-1 max-w-48 text-xs text-danger"
                >
                    {error}
                </p>
            )}

            {retry.current && !busy && (
                <button
                    type="button"
                    onClick={() => {
                        if (retry.current) void save(retry.current);
                    }}
                    className="mt-1 text-xs font-medium text-accent underline"
                >
                    ხელახლა ცდა
                </button>
            )}
        </div>
    );
}

export default function OrdersView({ data }: { data: OrdersPageData }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [selected, setSelected] = useState<OrderEntry | null>(null);
    const [returnOrderId, setReturnOrderId] =
        useState<string | null>(null);
    const [deleteOfferOrderId, setDeleteOfferOrderId] =
        useState<string | null>(null);
    const [checkedIds, setCheckedIds] = useState<string[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [printError, setPrintError] = useState("");
    const allChecked = data.orders.length > 0 && data.orders.every(order => checkedIds.includes(order.id));
    function toggleOrder(id: string) {
        setCheckedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    }
    function openSelectedPrint() {
        try {
            const key = crypto.randomUUID();
            sessionStorage.setItem(`marteo.invoice-selection.${key}`, JSON.stringify(checkedIds));
            window.open(`/print/orders?selection=${encodeURIComponent(key)}`, "_blank");
            setPrintError("");
        } catch { setPrintError("ბრაუზერის დროებით საცავში მონიშვნა ვერ შეინახა. მონიშვნა შენარჩუნებულია; სცადე ხელახლა."); }
    }
    const dialog = useRef<HTMLDialogElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const [draftPeriod, setDraftPeriod] = useState<OrdersPeriod>(data.period);
    const [previousPeriod, setPreviousPeriod] = useState(data.period);
    if (previousPeriod !== data.period) {
        setPreviousPeriod(data.period);
        setDraftPeriod(data.period);
    }
    const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent lg:text-sm";

    useEffect(() => {
        if (!selected) return;
        const element = dialog.current;
        element?.showModal();
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            element?.close();
            document.body.style.overflow = previous;
        };
    }, [selected]);

    useEffect(() => {
        const refresh = () => startTransition(() => router.refresh());
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [router]);

    function navigate(filter: OrdersFilter, query: string, page = 1, changes: Partial<{ period: OrdersPeriod; from: string; to: string; sort: OrdersSort; payment: OrdersPaymentFilter }> = {}) {
        const params = new URLSearchParams();
        if (filter !== "all") params.set("status", filter);
        if (query.trim()) params.set("q", query.trim());
        const next = { period: data.period, from: data.from, to: data.to, sort: data.sort, payment: data.payment, ...changes };
        if (next.period !== "week") params.set("period", next.period);
        if (next.period === "custom") { params.set("from", next.from); params.set("to", next.to); }
        if (next.sort !== "date-desc") params.set("sort", next.sort);
        if (next.payment !== "all") params.set("payment", next.payment);
        if (page > 1) params.set("page", String(page));
        router.push(`/dashboard/orders${params.size ? `?${params}` : ""}`, { scroll: false });
    }
    function close() {
        setSelected(null);
    }

    function openOrderReturn(orderId: string) {
        setSelected(null);
        setReturnOrderId(orderId);
    }

    function offerOrderDeletion(orderId: string) {
        setReturnOrderId(null);
        setSelected(null);
        setDeleteOfferOrderId(orderId);
    }

    return <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto min-w-0 max-w-7xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-semibold text-text-primary">შეკვეთები</h1>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="relative block min-w-0 sm:w-52">
                        <span className="sr-only">შეკვეთების პერიოდი</span>
                        <Icon icon="solar:calendar-linear" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-secondary" />
                        <select value={draftPeriod} disabled={pending} className={`${inputClass} pl-9`} onChange={event => {
                            const period = event.target.value as OrdersPeriod;
                            setDraftPeriod(period);
                            if (period !== "custom") startTransition(() => navigate(data.filter, data.query, 1, { period }));
                        }}>
                            <option value="day">ერთი დღე</option><option value="three-days">სამი დღე</option>
                            <option value="week">ერთი კვირა</option><option value="two-weeks">ორი კვირა</option>
                            <option value="month">ერთი თვე</option><option value="custom">სხვა</option>
                        </select>
                    </label>
                    <NewOrderButton className="!bg-success !text-white hover:!bg-success-hover" />
                </div>
            </div>
            {draftPeriod === "custom" && <form key={`${data.from}-${data.to}`} className="mt-4 grid min-w-0 grid-cols-1 items-end gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onInput={event => {
                const field = event.currentTarget.elements.namedItem("to") as HTMLInputElement;
                field.setCustomValidity("");
            }} onSubmit={event => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                const from = String(values.get("from") || "");
                const to = String(values.get("to") || "");
                if (from > to) { const field = event.currentTarget.elements.namedItem("to") as HTMLInputElement; field.setCustomValidity("ბოლო თარიღი საწყისზე ადრე არ უნდა იყოს."); field.reportValidity(); return; }
                startTransition(() => navigate(data.filter, data.query, 1, { period: "custom", from, to }));
            }}>
                <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">თარიღიდან</span><input type="date" name="from" required defaultValue={data.from} className={inputClass} /></label>
                <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">თარიღამდე</span><input type="date" name="to" required defaultValue={data.to} onChange={event => event.currentTarget.setCustomValidity("")} className={inputClass} /></label>
                <button disabled={pending} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white">ჩვენება</button>
            </form>}
            <p className="mt-3 text-xs text-text-secondary">პერიოდი: {data.from.split("-").reverse().join(".")} — {data.to.split("-").reverse().join(".")}</p>
            {data.periodError && <p role="alert" className="mt-2 text-sm text-danger">{data.periodError}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                {cards.map((card) => (
                    <button
                        key={card.id}
                        type="button"
                        disabled={pending}
                        aria-pressed={data.filter === card.id}
                        onClick={() =>
                            startTransition(() =>
                                navigate(card.id, data.query),
                            )
                        }
                        className={[
                            "min-w-0 rounded-2xl border p-3 text-left transition-colors sm:p-4",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                            card.id === "all"
                                ? "col-span-2 lg:col-span-1"
                                : "",
                            data.filter === card.id
                                ? card.selected
                                : "border-border bg-surface hover:bg-background",
                        ].join(" ")}
                    >
                        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
                            <span
                                className={[
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl lg:h-9 lg:w-9",
                                    card.tone,
                                ].join(" ")}
                            >
                                <Icon
                                    icon={card.icon}
                                    aria-hidden="true"
                                    className="h-4 w-4 lg:h-5 lg:w-5"
                                />
                            </span>

                            <span className="min-w-0 flex-1 text-xs font-medium text-text-secondary lg:text-sm">
                                {card.title}
                            </span>

                            <span className="shrink-0 text-lg font-semibold tabular-nums text-text-primary lg:hidden">
                                {data.counts[card.id]}
                            </span>
                        </div>

                        <p className="mt-2 hidden text-2xl font-semibold tabular-nums text-text-primary lg:block">
                            {data.counts[card.id]}
                        </p>
                    </button>
                ))}
            </div>
            <section id="orders-list" aria-busy={pending} className="mt-6 min-w-0 scroll-mt-20 rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 p-4">
                    <Icon icon="solar:clipboard-list-linear" className="h-5 w-5 text-accent" />
                    <h2 className="font-semibold text-text-primary">შეკვეთების სია</h2>
                    <span className="text-sm text-text-secondary">{data.totalOrders} შეკვეთა</span>
                    {pending && <Icon icon="solar:refresh-linear" className="h-4 w-4 animate-spin text-accent" aria-label="იტვირთება" />}
                </div>
                <div className="px-3 pb-4 sm:px-4">
                    <InventoryFiltersDisclosure defaultOpen={false} hasFilters={Boolean(data.query || data.filter !== "all" || data.payment !== "all" || data.sort !== "date-desc")}>
                        <form key={`${data.query}-${data.filter}-${data.payment}-${data.sort}`} className="grid min-w-0 grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-4 sm:p-4" onSubmit={event => {
                            event.preventDefault();
                            const values = new FormData(event.currentTarget);
                            startTransition(() => navigate(String(values.get("status")) as OrdersFilter, search.current?.value || "", 1, {
                                sort: String(values.get("sort")) as OrdersSort,
                                payment: String(values.get("payment")) as OrdersPaymentFilter,
                            }));
                        }}>
                            <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">ძებნა</span><input ref={search} name="q" defaultValue={data.query} placeholder="ნომერი, მიმღები ან პროდუქტი" className={inputClass} /></label>
                            <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">შეკვეთის სტატუსი</span><select name="status" defaultValue={data.filter} className={inputClass}><option value="all">ყველა</option><option value="processing">მუშავდება</option><option value="shipped">გაგზავნილი</option><option value="completed">დასრულებული</option><option value="canceled">გაუქმებული</option><option value="returned">დაბრუნებული</option></select></label>
                            <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">გადახდის სტატუსი</span><select name="payment" defaultValue={data.payment} className={inputClass}><option value="all">ყველა</option><option value="PAID">გადახდილი</option><option value="UNPAID">გადაუხდელი</option><option value="PARTIALLY_PAID">ნაწილობრივ</option><option value="COURIER_ONLY_PAID">მხოლოდ კურიერი</option></select></label>
                            <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">დალაგება</span><select name="sort" defaultValue={data.sort} className={inputClass}><option value="date-desc">ჯერ ახალი</option><option value="date-asc">ჯერ ძველი</option><option value="number-desc">ნომერი: კლებადობით</option><option value="number-asc">ნომერი: ზრდადობით</option><option value="recipient-asc">მიმღები: ა → ჰ</option><option value="recipient-desc">მიმღები: ჰ → ა</option></select></label>
                            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row xl:col-span-4">
                                <button disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"><Icon icon="solar:magnifer-linear" className="h-5 w-5" />ჩვენება</button>
                                <button type="button" disabled={pending} onClick={() => startTransition(() => navigate("all", "", 1, { payment: "all", sort: "date-desc" }))} className="h-11 rounded-xl border border-border px-4 text-sm text-text-secondary">გასუფთავება</button>
                            </div>
                        </form>
                    </InventoryFiltersDisclosure>
                </div>
                <div className="border-t border-border px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                                setSelectionMode(current => !current);
                                setCheckedIds([]);
                                setPrintError("");
                            }}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50 ${selectionMode
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-border text-text-primary hover:border-accent"
                                }`}
                        >
                            <Icon
                                icon={
                                    selectionMode
                                        ? "solar:close-circle-linear"
                                        : "solar:checklist-minimalistic-linear"
                                }
                                className="h-5 w-5"
                            />
                            {selectionMode
                                ? "მონიშვნის დასრულება"
                                : "მონიშვნა"}
                        </button>

                        {!selectionMode && (
                            <>
                                {data.invoiceCounts.new > 0 && (
                                    <a
                                        href="/print/orders?mode=new"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text-primary"
                                    >
                                        <Icon
                                            icon="solar:documents-linear"
                                            className="h-5 w-5 text-success"
                                        />
                                        ახალი ინვოისები ({data.invoiceCounts.new})
                                    </a>
                                )}

                                {data.invoiceCounts.updated > 0 && (
                                    <a
                                        href="/print/orders?mode=pending"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text-primary"
                                    >
                                        <Icon
                                            icon="solar:document-text-linear"
                                            className="h-5 w-5 text-warning"
                                        />
                                        ყველა დასაბეჭდი (
                                        {data.invoiceCounts.new +
                                            data.invoiceCounts.updated}
                                        )
                                    </a>
                                )}
                            </>
                        )}

                        {selectionMode && (
                            <>
                                <span
                                    aria-live="polite"
                                    className="px-1 text-sm text-text-secondary"
                                >
                                    მონიშნულია: {checkedIds.length}
                                </span>

                                {checkedIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={openSelectedPrint}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white"
                                    >
                                        <Icon
                                            icon="solar:documents-linear"
                                            className="h-5 w-5"
                                        />
                                        ინვოისების ბეჭდვა
                                    </button>
                                )}

                                <OrderBulkDeleteButton
                                    orderIds={checkedIds}
                                    onDeleted={deletedIds => {
                                        setCheckedIds(current =>
                                            current.filter(
                                                id => !deletedIds.includes(id),
                                            ),
                                        );
                                    }}
                                    onReview={orderId => {
                                        setSelected(null);
                                        setReturnOrderId(null);
                                        setDeleteOfferOrderId(orderId);
                                    }}
                                />
                            </>
                        )}
                    </div>

                    {selectionMode && (
                        <p className="mt-2 text-xs text-text-secondary">
                            მონიშნე სასურველი შეკვეთები. სათაურის ჩეკბოქსი
                            ამ გვერდის ყველა შეკვეთას მონიშნავს.
                        </p>
                    )}

                    {printError && (
                        <p
                            role="alert"
                            className="mt-2 text-sm text-danger"
                        >
                            {printError}
                        </p>
                    )}
                </div>
                {pending ? (
                    <OrdersListSkeleton />
                ) : data.orders.length === 0 ? <div className="flex flex-col items-center gap-3 px-4 py-12 text-text-secondary"><Icon icon="solar:clipboard-list-linear" className="h-10 w-10" /><p>{data.counts.all === 0 ? "ამ პერიოდში შეკვეთები არ არის" : "შეკვეთა ვერ მოიძებნა"}</p></div> :
                    <table className="w-full table-fixed border-collapse text-left">
                        <thead className="sticky top-16 z-20 bg-background text-xs text-text-secondary sm:text-sm">
                            <tr>
                                {selectionMode && (
                                    <th className="w-9 px-2 py-3">
                                        <input
                                            type="checkbox"
                                            checked={allChecked}
                                            disabled={pending}
                                            aria-label="ამ გვერდის ყველა შეკვეთის მონიშვნა"
                                            onChange={event => {
                                                const checked = event.target.checked;

                                                setCheckedIds(current =>
                                                    checked
                                                        ? [
                                                            ...new Set([
                                                                ...current,
                                                                ...data.orders.map(order => order.id),
                                                            ]),
                                                        ]
                                                        : current.filter(
                                                            id => !data.orders.some(
                                                                order => order.id === id,
                                                            ),
                                                        ),
                                                );
                                            }}
                                            className="h-4 w-4 accent-accent"
                                        />
                                    </th>
                                )}
                                <th className="w-[35%] px-3 py-3 sm:w-[13%] sm:px-4 xl:w-[12%]">შეკვეთა</th>
                                <th className="hidden w-[22%] px-3 py-3 sm:table-cell xl:w-[18%]">მიმღები</th>
                                <th className="hidden w-[22%] px-3 py-3 lg:table-cell xl:w-[18%]">პროდუქტები</th>
                                <th className="w-[23%] px-2 py-3 sm:w-[15%] xl:w-[14%]">თანხა</th>
                                <th className="w-[18%] px-1 py-3 sm:w-[17%] xl:w-[15%]">სტატუსი</th>
                                <th className="hidden w-[12%] px-2 py-3 xl:table-cell">გადახდა</th>
                                <th className="w-[15%] px-1 py-3 sm:w-[8%]"><span className="sr-only">დეტალები</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.orders.map(order => {
                                const image = order.items.find(
                                    item => Boolean(item.imageUrl),
                                )?.imageUrl;

                                const hasExtraInfo =
                                    order.printState !== "PRINTED" ||
                                    order.pendingReturnQuantity > 0 ||
                                    order.receivedReturnQuantity > 0 ||
                                    Boolean(order.deleteRequestedAt) ||
                                    order.refundDue !== "0.00" ||
                                    order.hasPastReturns;

                                return (
                                    <tr
                                        key={order.id}
                                        className={`h-20 border-t border-border transition-colors ${selectionMode && checkedIds.includes(order.id)
                                            ? "bg-accent/10"
                                            : order.pendingReturnQuantity > 0
                                                ? "bg-warning/10"
                                                : ""
                                            }`}
                                    >
                                        {selectionMode && (
                                            <td className="px-2 py-2 align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={checkedIds.includes(order.id)}
                                                    disabled={pending}
                                                    onChange={() => toggleOrder(order.id)}
                                                    aria-label={`${number(order)} მონიშვნა`}
                                                    className="h-4 w-4 accent-accent"
                                                />
                                            </td>
                                        )}

                                        <td className="px-2 py-2 align-middle sm:px-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background sm:h-10 sm:w-10">
                                                    {image ? (
                                                        <Image
                                                            src={image}
                                                            alt="შეკვეთის პროდუქტი"
                                                            width={40}
                                                            height={40}
                                                            unoptimized
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Icon
                                                            icon="solar:box-linear"
                                                            className="h-5 w-5 text-accent"
                                                        />
                                                    )}
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-semibold text-text-primary sm:text-sm">
                                                        {number(order)}
                                                    </p>

                                                    <p className="mt-1 truncate text-[11px] text-text-secondary sm:hidden">
                                                        {recipient(order)}
                                                    </p>

                                                    <p className="mt-1 hidden truncate text-[11px] text-text-secondary sm:block">
                                                        {date(order.createdAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="hidden px-3 py-2 align-middle sm:table-cell">
                                            <p className="truncate text-sm font-medium text-text-primary">
                                                {recipient(order)}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-text-secondary">
                                                {order.recipientPhone}
                                            </p>
                                        </td>

                                        <td className="hidden px-3 py-2 align-middle lg:table-cell">
                                            <p className="truncate text-sm text-text-primary">
                                                {order.items[0]?.name || "—"}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-text-secondary">
                                                {order.productQuantity} პროდუქტი
                                            </p>
                                        </td>

                                        <td className="px-2 py-2 align-middle">
                                            <p className="truncate text-xs font-semibold tabular-nums text-text-primary sm:text-sm">
                                                {order.total} ₾
                                            </p>
                                        </td>

                                        <td className="px-1 py-2 align-middle">
                                            <Status
                                                order={order}
                                                onReturn={openOrderReturn}
                                            />
                                        </td>

                                        <td className="hidden px-2 py-2 align-middle xl:table-cell">
                                            <p className="truncate text-xs text-text-secondary">
                                                {payments[order.paymentStatus]}
                                            </p>
                                        </td>

                                        <td className="px-1 py-2 align-middle">
                                            <button
                                                type="button"
                                                onClick={() => setSelected(order)}
                                                aria-label={`${number(order)} დეტალები${hasExtraInfo
                                                    ? " — დამატებითი ინფორმაცია"
                                                    : ""
                                                    }`}
                                                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary transition hover:border-accent hover:text-accent"
                                            >
                                                <Icon
                                                    icon="solar:menu-dots-bold"
                                                    className="h-5 w-5"
                                                />

                                                {hasExtraInfo && (
                                                    <span
                                                        aria-hidden="true"
                                                        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${order.pendingReturnQuantity > 0 ||
                                                            order.deleteRequestedAt
                                                            ? "bg-warning"
                                                            : "bg-accent"
                                                            }`}
                                                    />
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>}
                <OrdersPagination
                    currentPage={data.currentPage}
                    totalPages={data.totalPages}
                    onPageChange={(page) => {
                        startTransition(() => {
                            navigate(data.filter, data.query, page);
                        });
                    }}
                />
            </section>
        </div>
        <dialog ref={dialog} onCancel={close} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-labelledby="order-details-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/25 backdrop:backdrop-blur-sm">
            {selected && <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <h2
                        id="order-details-title"
                        className="min-w-0 text-lg font-semibold"
                    >
                        შეკვეთა {number(selected)}
                    </h2>

                    <div className="flex shrink-0 items-center gap-2">
                        <OrderInvoiceButton orderId={selected.id} />
                        {selected.status !== "COMPLETED" &&
                            selected.status !== "RETURNED" &&
                            !selected.hasReturnHistory && (
                                <OrderEditButton
                                    key={selected.id}
                                    orderId={selected.id}
                                    onOpened={close}
                                />
                            )}

                        <OrderDeleteButton
                            key={`delete-${selected.id}`}
                            orderId={selected.id}
                            onDeleted={close}
                            onReadyToDelete={offerOrderDeletion}
                        />

                        <button
                            type="button"
                            onClick={close}
                            aria-label="დახურვა"
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-6 w-6"
                            />
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2"><Status
                    order={selected}
                    onReturn={openOrderReturn}
                /><span className="text-sm text-text-secondary">{payments[selected.paymentStatus]}</span></div>
                <section
                    aria-label="შეკვეთის დამატებითი ინფორმაცია"
                    className="mt-4 space-y-2"
                >
                    {selected.hasPastReturns && (
                        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-text-secondary">
                            <Icon
                                icon="solar:history-linear"
                                className="h-4 w-4 shrink-0 text-accent"
                            />
                            <span>
                                შეკვეთაზე გადაცვლა შესრულებულია. წინა ნივთების
                                დაბრუნების ისტორია შენახულია — მის სანახავად
                                სტატუსის მენიუში აირჩიე „დაბრუნების მართვა“.
                            </span>
                        </p>
                    )}
                    <p className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs text-text-secondary">
                        <Icon
                            icon="solar:document-text-linear"
                            className="h-4 w-4 shrink-0 text-accent"
                        />
                        <span>
                            {selected.printState === "NEW"
                                ? "ინვოისი ჯერ არ დაბეჭდილა."
                                : selected.printState === "UPDATED"
                                    ? "შეკვეთა შეიცვალა. განახლებული ინვოისი ხელახლა დასაბეჭდია."
                                    : "ინვოისის მიმდინარე ვერსია დაბეჭდილია."}
                        </span>
                    </p>

                    {selected.pendingReturnQuantity > 0 && (
                        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                            <Icon
                                icon="solar:clock-circle-linear"
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>
                                ველოდებით {selected.pendingReturnQuantity} პროდუქტის
                                ფიზიკურ დაბრუნებას. მარაგი მიღების დადასტურებამდე
                                არ შეიცვლება.
                            </span>
                        </p>
                    )}

                    {selected.receivedReturnQuantity > 0 && (
                        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-accent">
                            <Icon
                                icon="solar:undo-left-round-linear"
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>
                                მიღებულია {selected.receivedReturnQuantity} დაბრუნებული
                                პროდუქტი. მარაგიდან გაყიდული ნივთების დაბრუნება
                                უკვე აღრიცხულია.
                            </span>
                        </p>
                    )}

                    {selected.deleteRequestedAt && (
                        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                            <Icon
                                icon="solar:trash-bin-trash-linear"
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>
                                წაშლა მოთხოვნილია.
                                {selected.pendingReturnQuantity > 0
                                    ? " ჯერ ველოდებით ნივთების დაბრუნებას; მიღების შემდეგ წაშლის დადასტურებას შემოგთავაზებთ."
                                    : " დაბრუნების მოლოდინი დასრულებულია. შეკვეთის წაშლა შეგიძლია წაშლის ღილაკიდან დაადასტურო."}
                            </span>
                        </p>
                    )}
                </section>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    {[['მიმღები', recipient(selected)], ['ტელეფონი', selected.recipientPhone], ['მისამართი', selected.shippingAddress || '—'], ['თარიღი', date(selected.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-text-secondary">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
                </dl>
                <h3 className="mt-5 font-semibold">პროდუქტები</h3>
                <div className="mt-2 space-y-2">
                    {selected.items.map(item => (
                        <article
                            key={item.id}
                            className="rounded-xl border border-border p-3"
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                                    {item.imageUrl ? (
                                        <Image
                                            src={item.imageUrl}
                                            alt={item.name}
                                            width={56}
                                            height={56}
                                            unoptimized
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Icon
                                            icon="solar:box-linear"
                                            className="h-6 w-6 text-accent"
                                        />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="break-words font-medium">
                                        {item.name}
                                    </p>

                                    <p className="mt-1 text-xs text-text-secondary">
                                        {[
                                            item.color,
                                            item.size,
                                            item.condition === "DEFECTIVE"
                                                ? "წუნდებული"
                                                : null,
                                        ].filter(Boolean).join(" · ")}
                                    </p>

                                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                                        <span>
                                            {item.quantity} × {item.unitPrice} ₾
                                        </span>
                                        <span className="font-semibold">
                                            {item.total} ₾
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {item.description && (
                                <p className="mt-3 break-words text-xs text-text-secondary">
                                    {item.description}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
                {selected.payments.length > 0 && <div className="mt-4 border-t border-border pt-3"><h3 className="text-sm font-semibold">გადახდები</h3>{selected.payments.map(payment => <p key={payment.id} className="mt-2 text-xs text-text-secondary">{date(payment.createdAt)} · {methods[payment.method]}{payment.bankName ? ` · ${payment.bankName}` : ''} · {payment.amount} ₾</p>)}</div>}
                <dl className="mt-4 space-y-2 text-sm">
                    {[
                        ["პროდუქტები", selected.productsTotal],
                        ["კურიერის საფასური", selected.courierFee],
                        ["სულ", selected.total],
                        ["გადახდილი", selected.paidAmount],
                        ["დარჩენილი გადასახდელი", selected.remainingAmount],
                    ].map(([label, value]) => (
                        <div
                            key={label}
                            className="flex justify-between gap-3"
                        >
                            <dt className="text-text-secondary">
                                {label}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                                {value} ₾
                            </dd>
                        </div>
                    ))}
                </dl>

                {selected.refundDue !== "0.00" && (
                    <section className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                        <div className="flex items-start gap-3">
                            <Icon
                                icon="solar:wallet-money-linear"
                                className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                            />

                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-warning">
                                    კლიენტს დასაბრუნებელია {selected.refundDue} ₾
                                </h3>

                                <p className="mt-2 text-xs text-text-secondary">
                                    გადახდილი თანხა შეკვეთის მიმდინარე ჯამს
                                    აღემატება. თანხის დაბრუნება ჯერ არ არის
                                    აღრიცხული.
                                </p>

                                <p className="mt-2 text-xs text-text-secondary">
                                    ჯერ დაუბრუნე თანხა კლიენტს, შემდეგ
                                    დაადასტურე ქვემოთ. ეს ღილაკი თანხას
                                    ბანკიდან ავტომატურად არ გადარიცხავს.
                                </p>
                            </div>
                        </div>

                        <div className="mt-3">
                            <OrderRefundButton
                                orderId={selected.id}
                                onUpdated={close}
                            />
                        </div>
                    </section>
                )}
            </div>}
        </dialog>

        {returnOrderId && (
            <OrderReturnButton
                key={`return-${returnOrderId}`}
                orderId={returnOrderId}
                autoOpen
                onDismiss={() => {
                    setReturnOrderId(null);
                }}
                onDeleted={() => {
                    setReturnOrderId(null);
                    close();
                }}
                onReadyToDelete={offerOrderDeletion}
            />
        )}

        {deleteOfferOrderId && (
            <OrderDeleteButton
                key={`automatic-delete-${deleteOfferOrderId}`}
                orderId={deleteOfferOrderId}
                autoOpen
                onReadyToDelete={offerOrderDeletion}
                onDismiss={() => {
                    setDeleteOfferOrderId(null);
                }}
                onDeleted={() => {
                    setDeleteOfferOrderId(null);
                    setSelected(null);
                }}
            />
        )}
    </main>;
}
