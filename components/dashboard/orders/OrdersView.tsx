"use client";


import { ORDERS_CHANGED } from "@/lib/orders/refresh-orders-client";

import ProductThumbnail from "@/components/shared/ProductThumbnail";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";
import type { OrderEntry, OrderDetailEntry, OrdersFilter, OrdersPageData, OrdersSort, OrdersPaymentFilter } from "@/lib/orders/get-orders-page";
import type { OrdersPeriod } from "@/lib/orders/orders-period";
import { deliveryZoneLabel } from "@/lib/orders/order-form";
import NewOrderButton from "./NewOrderButton";
import OrdersPagination from "./OrdersPagination";
import InventoryFiltersDisclosure from "@/components/dashboard/inventory/InventoryFiltersDisclosure";
import OrderBulkDeleteButton from "./OrderBulkDeleteButton";
import OrderBulkStatusButtons from "./OrderBulkStatusButtons";
import OrdersListSkeleton from "./OrdersListSkeleton";
import PeriodFilter, {
    standardPeriodOptions,
} from "@/components/dashboard/shared/PeriodFilter";

// These actions appear only after opening details or a return/delete flow.
// Keep their forms out of the initial server render and browser module load.
const OrderReturnButton = dynamic(() => import("./OrderReturnButton"), { ssr: false });
const OrderDeleteButton = dynamic(() => import("./OrderDeleteButton"), { ssr: false });
import { OrderDetailsBody, Status, number, payments, recipient, date } from "./OrderDetailsBody";
import { orderCards as cards } from "./order-labels";
import GuidedTour from "@/components/tour/GuidedTour";
import TourHelpButton from "@/components/tour/TourHelpButton";
import { useTour } from "@/components/tour/useTour";
import { ordersTourSteps } from "./orders-tour";



export default function OrdersView({
    data: initialData,
    basePath = "/dashboard/orders",
    listEndpoint = "/api/orders/list",
    showTour = false,
}: {
    data: OrdersPageData;
    basePath?: string;
    listEndpoint?: string;
    // პირველ შესვლაზე გაცნობითი ტური თავისით ირთვება.
    showTour?: boolean;
}) {
    const [data, setData] = useState(initialData);
    const tour = useTour("orders", showTour);

    useEffect(() => {
        setData(initialData);
        setMutationLoading(false);
    }, [initialData]);
    const router = useRouter();
    const [routePending, startTransition] = useTransition();
    const [mutationLoading, setMutationLoading] = useState(false);
    const refreshVersion = useRef(0);
    const pending = routePending || mutationLoading;
    const [selected, setSelected] = useState<OrderDetailEntry | null>(null);
    const [detailTarget, setDetailTarget] = useState<OrderEntry | null>(null);
    const [detailError, setDetailError] = useState("");
    const detailRequest = useRef<AbortController | null>(null);
    const selectedId = useRef<string | null>(null);
    useEffect(() => { selectedId.current = selected?.id ?? null; }, [selected]);
    const [returnOrderId, setReturnOrderId] =
        useState<string | null>(null);
    const [deleteOfferOrderId, setDeleteOfferOrderId] =
        useState<string | null>(null);
    const [checkedIds, setCheckedIds] = useState<string[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const checkedOrders = data.orders.filter(order => checkedIds.includes(order.id));
    const [printError, setPrintError] = useState("");
    useEffect(() => {
        let active = true;
        const versionRef = refreshVersion;
        let request: AbortController | null = null;
        let queued: ReturnType<typeof setTimeout> | null = null;
        function changed(event: Event) {
            event.preventDefault();
            // Merge synchronous notifications; a later mutation supersedes an older read.
            if (queued) clearTimeout(queued);
            request?.abort();
            const version = ++versionRef.current;
            setMutationLoading(true);
            queued = setTimeout(() => {
                queued = null;
                const controller = new AbortController();
                request = controller;
                const search = window.location.search;
                void (async () => {
                    try {
                        const response = await fetch(`${listEndpoint}${search}`, {
                            cache: "no-store", credentials: "same-origin", signal: controller.signal,
                        });
                        const body = await response.json() as { success?: boolean; data?: OrdersPageData; message?: string };
                        if (!response.ok || !body.success || !body.data || !Array.isArray(body.data.orders)) {
                            throw new Error(body.message || "შეკვეთების სია ვერ განახლდა.");
                        }
                        if (!active || controller.signal.aborted || versionRef.current !== version || window.location.search !== search) return;
                        const next = body.data;
                        setData(next);
                        setCheckedIds(ids => ids.filter(id => next.orders.some(order => order.id === id)));
                        setPrintError("");
                        const detailId = selectedId.current;
                        if (detailId) {
                            if (!next.orders.some(order => order.id === detailId)) {
                                setSelected(current => current?.id === detailId ? null : current);
                            } else {
                                const detailResponse = await fetch(`/api/orders/${encodeURIComponent(detailId)}/details`, {
                                    cache: "no-store", credentials: "same-origin", signal: controller.signal,
                                });
                                const detail = await detailResponse.json() as { success?: boolean; order?: OrderDetailEntry };
                                if (!detailResponse.ok || !detail.success || !detail.order?.detailsLoaded || detail.order.id !== detailId) {
                                    throw new Error("სია განახლდა, მაგრამ შეკვეთის დეტალები ვერ განახლდა.");
                                }
                                if (!active || controller.signal.aborted || versionRef.current !== version || window.location.search !== search) return;
                                setSelected(current => current?.id === detailId ? detail.order! : current);
                            }
                        }
                        const params = new URLSearchParams(search);
                        if (next.currentPage > 1) params.set("page", String(next.currentPage));
                        else params.delete("page");
                        window.history.replaceState(window.history.state, "",
                            `${basePath}${params.size ? `?${params}` : ""}${window.location.hash}`);
                    } catch (cause) {
                        if (active && !controller.signal.aborted) {
                            setPrintError(cause instanceof Error ? cause.message : "შეკვეთების სია ვერ განახლდა.");
                        }
                    } finally {
                        if (active && !controller.signal.aborted) setMutationLoading(false);
                    }
                })();
            }, 0);
        }
        window.addEventListener(ORDERS_CHANGED, changed);
        return () => {
            active = false;
            versionRef.current++;
            request?.abort();
            if (queued) clearTimeout(queued);
            window.removeEventListener(ORDERS_CHANGED, changed);
        };
    }, [basePath, listEndpoint, initialData]);

    const allChecked = data.orders.length > 0 && data.orders.every(order => checkedIds.includes(order.id));
    function toggleOrder(id: string) {
        setCheckedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    }
    function openSelectedPrint() {
        try {
            const key = crypto.randomUUID();
            sessionStorage.setItem(`marteo.invoice-selection.${key}`, JSON.stringify(checkedIds));
            window.location.assign(`/print/orders?selection=${encodeURIComponent(key)}`);
            setPrintError("");
        } catch { setPrintError("ბრაუზერის დროებით საცავში მონიშვნა ვერ შეინახა. მონიშვნა შენარჩუნებულია; სცადეთ ხელახლა."); }
    }
    const dialog = useRef<HTMLDialogElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent lg:text-sm";
    const detailsOpen = Boolean(selected || detailTarget);

    useEffect(() => {
        if (!detailsOpen) return;
        const element = dialog.current;
        element?.showModal();
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            element?.close();
            document.body.style.overflow = previous;
        };
    }, [detailsOpen]);

    useEffect(() => () => detailRequest.current?.abort(), []);

    // ჯგუფური დასრულებიდან გახსნილი შეკვეთა შეიძლება მიმდინარე გვერდზე არ იყოს.
    async function openOrderById(orderId: string) {
        const known = data.orders.find(order => order.id === orderId);
        if (known) return openDetails(known);
        detailRequest.current?.abort();
        const controller = new AbortController();
        detailRequest.current = controller;
        try {
            const response = await fetch(
                `/api/orders/${encodeURIComponent(orderId)}/details`,
                { cache: "no-store", credentials: "same-origin", signal: controller.signal },
            );
            const body = await response.json() as { success?: boolean; order?: OrderDetailEntry | null };
            if (controller.signal.aborted || !response.ok || !body.success || !body.order?.detailsLoaded) return;
            setDetailTarget(null);
            setSelected(body.order);
        } catch {
            // დეტალები ვერ ჩაიტვირთა: შეკვეთა ძებნით მაინც მოიძებნება.
        }
    }

    async function openDetails(order: OrderEntry) {
        detailRequest.current?.abort();
        const controller = new AbortController();
        detailRequest.current = controller;
        setSelected(null);
        setDetailTarget(order);
        setDetailError("");
        try {
            const response = await fetch(
                `/api/orders/${encodeURIComponent(order.id)}/details`,
                { cache: "no-store", credentials: "same-origin", signal: controller.signal },
            );
            const body = await response.json() as { success?: boolean; order?: OrderDetailEntry | null; message?: string };
            if (!response.ok || !body.success || !body.order?.detailsLoaded || body.order.id !== order.id) {
                throw new Error(body.message || "შეკვეთის დეტალები ვერ ჩაიტვირთა.");
            }
            if (controller.signal.aborted) return;
            setSelected(body.order);
            setDetailTarget(null);
        } catch (cause) {
            if (controller.signal.aborted) return;
            setDetailError(cause instanceof Error ? cause.message : "შეკვეთის დეტალები ვერ ჩაიტვირთა.");
        }
    }

    async function refreshOrder(orderId: string) {
        if (mutationLoading) {
            window.dispatchEvent(new Event(ORDERS_CHANGED, { cancelable: true }));
            return;
        }
        const version = ++refreshVersion.current;
        try {
            if (data.filter !== "all" || data.payment !== "all") {
                const response = await fetch(
                    `${listEndpoint}${window.location.search}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                    },
                );

                const raw: unknown = await response.json();

                if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                    throw new Error("შეკვეთების სია ვერ განახლდა.");
                }

                const body = raw as {
                    success?: boolean;
                    message?: string;
                    data?: OrdersPageData;
                };

                if (
                    !response.ok ||
                    body.success !== true ||
                    !body.data ||
                    !Array.isArray(body.data.orders)
                ) {
                    throw new Error(
                        body.message || "შეკვეთების სია ვერ განახლდა.",
                    );
                }

                const updatedData = body.data;
                if (refreshVersion.current !== version) return;
                setData(updatedData);

                setCheckedIds(current =>
                    current.filter(id =>
                        updatedData.orders.some(order => order.id === id),
                    ),
                );

                if (selected?.id === orderId) {
                    const row = updatedData.orders.find(order => order.id === orderId);
                    if (row) await openDetails(row);
                    else close();
                }

                const params = new URLSearchParams(window.location.search);
                params.set("page", String(updatedData.currentPage));

                window.history.replaceState(
                    null,
                    "",
                    `${basePath}?${params.toString()}${window.location.hash}`,
                );

                return;
            }
            const response = await fetch(
                `/api/orders/${encodeURIComponent(orderId)}/row${window.location.search}`,
                {
                    cache: "no-store",
                    credentials: "same-origin",
                },
            );

            const raw: unknown = await response.json();

            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                throw new Error("შეკვეთის განახლებული მონაცემები ვერ ჩაიტვირთა.");
            }

            const body = raw as {
                success?: boolean;
                message?: string;
                order?: OrderEntry | null;
                summary?: Pick<
                    OrdersPageData,
                    | "counts"
                    | "invoiceCounts"
                    | "queueCounts"
                    | "totalOrders"
                    | "currentPage"
                    | "totalPages"
                >;
            };

            if (
                !response.ok ||
                body.success !== true ||
                !body.summary ||
                body.order === undefined ||
                (body.order !== null && body.order.id !== orderId)
            ) {
                throw new Error(
                    body.message ||
                    "შეკვეთის განახლებული მონაცემები ვერ ჩაიტვირთა.",
                );
            }

            const updated = body.order;
            const summary = body.summary;
            if (refreshVersion.current !== version) return;


            setData(current => ({
                ...current,
                ...summary,
                orders: updated
                    ? current.orders.map(order =>
                        order.id === orderId &&
                            updated.invoiceVersion >= order.invoiceVersion
                            ? updated
                            : order,
                    )
                    : current.orders.filter(order => order.id !== orderId),
            }));

            setSelected(current =>
                current?.id === orderId ? (updated?.detailsLoaded ? updated : null) : current,
            );

            if (!updated) {
                setCheckedIds(current =>
                    current.filter(id => id !== orderId),
                );
            }
        } catch (cause: unknown) {
            // მოქმედება უკვე შესრულებულია; თავიდან არ ვაგზავნით.
            setPrintError(
                cause instanceof Error
                    ? cause.message
                    : "შეკვეთის განახლებული მონაცემები ვერ ჩაიტვირთა.",
            );
        }
    }

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
        router.push(`${basePath}${params.size ? `?${params}` : ""}`, { scroll: false });
    }
    function close() {
        detailRequest.current?.abort();
        setDetailTarget(null);
        setDetailError("");
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
        <GuidedTour steps={ordersTourSteps} open={tour.open} onClose={tour.close} />
        <div className="mx-auto min-w-0 max-w-7xl">
            <PeriodFilter
                heading={
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold text-text-primary">
                            შეკვეთები
                        </h1>
                        <TourHelpButton onClick={tour.start} />
                    </div>
                }
                action={
                    <NewOrderButton tourId="new-order" className="!bg-success !text-white hover:!bg-success-hover" />
                }
                value={data.period}
                from={data.from}
                to={data.to}
                options={standardPeriodOptions}
                pending={pending}
                onChange={({ period, from, to }) => {
                    startTransition(() => {
                        navigate(
                            data.filter,
                            data.query,
                            1,
                            { period, from, to },
                        );
                    });
                }}
            />
            <p className="mt-3 text-xs text-text-secondary">პერიოდი: {data.from.split("-").reverse().join(".")} - {data.to.split("-").reverse().join(".")}</p>
            {data.periodError && <p role="alert" className="mt-2 text-sm text-danger">{data.periodError}</p>}
            <div data-tour="order-status-cards" className="mt-6 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
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
                        <div
                            className={[
                                "grid min-w-0 items-center gap-2",
                                card.id === "all"
                                    ? "grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)]"
                                    : "grid-cols-[auto_minmax(0,1fr)]",
                            ].join(" ")}
                        >
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

                            <span className={[
                                "min-w-0 [overflow-wrap:anywhere] text-xs font-medium leading-relaxed text-text-secondary lg:text-sm",
                                card.id === "all"
                                    ? "lg:col-span-2 lg:row-start-2 lg:mt-1"
                                    : "col-span-2 row-start-2 mt-1",
                            ].join(" ")}>
                                {card.title}
                            </span>

                            <span className={[
                                "min-w-0 text-right text-lg font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere] lg:text-2xl",
                                card.id === "all"
                                    ? "lg:col-start-2 lg:row-start-1"
                                    : "col-start-2 row-start-1",
                            ].join(" ")}>
                                {data.counts[card.id]}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
            <section id="orders-list" data-tour="orders-list" aria-busy={pending} className="mt-6 min-w-0 scroll-mt-20 rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 p-4">
                    <Icon icon="solar:clipboard-list-linear" className="h-5 w-5 text-accent" />
                    <h2 className="font-semibold text-text-primary">შეკვეთების სია</h2>
                    <span className="text-sm text-text-secondary">{data.totalOrders} შეკვეთა</span>
                    {pending && <Icon icon="solar:refresh-linear" className="h-4 w-4 animate-spin text-accent" aria-label="იტვირთება" />}
                </div>
                {(data.orders.length > 0 ||
                    Boolean(data.query) ||
                    data.filter !== "all" ||
                    data.payment !== "all" ||
                    data.sort !== "date-desc") && (
                        <div data-tour="orders-filters" className="px-3 pb-4 sm:px-4">
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
                                    <label className="block min-w-0">
                                        <span className="mb-1.5 block text-sm text-text-secondary">
                                            გადახდის სტატუსი
                                        </span>
                                        <select
                                            name="payment"
                                            defaultValue={data.payment}
                                            className={inputClass}
                                        >
                                            <option value="all">ყველა</option>
                                            <option value="PAID">გადახდილი</option>
                                            <option value="UNPAID">გადასახდელი</option>
                                            <option value="PARTIALLY_PAID">ნაწილობრივ</option>
                                            <option value="COURIER_ONLY_PAID">მხოლოდ კურიერი</option>
                                            <option value="UNKNOWN">დაუზუსტებელი</option>
                                        </select>
                                    </label>
                                    <label className="block min-w-0"><span className="mb-1.5 block text-sm text-text-secondary">დალაგება</span><select name="sort" defaultValue={data.sort} className={inputClass}><option value="date-desc">ჯერ ახალი</option><option value="date-asc">ჯერ ძველი</option><option value="number-desc">ნომერი: კლებადობით</option><option value="number-asc">ნომერი: ზრდადობით</option><option value="recipient-asc">მიმღები: ა → ჰ</option><option value="recipient-desc">მიმღები: ჰ → ა</option></select></label>
                                    <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row xl:col-span-4">
                                        <button disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"><Icon icon="solar:magnifer-linear" className="h-5 w-5" />ჩვენება</button>
                                        <button type="button" disabled={pending} onClick={() => startTransition(() => navigate("all", "", 1, { payment: "all", sort: "date-desc" }))} className="h-11 rounded-xl border border-border px-4 text-sm text-text-secondary">გასუფთავება</button>
                                    </div>
                                </form>
                            </InventoryFiltersDisclosure>
                        </div>
                    )}
                <div className="border-t border-border px-3 py-3 sm:px-4">
                    {/* ერთი ხაზი, რომელიც ჰორიზონტალურად სქროლდება, რომ ღილაკების რაოდენობამ სიმაღლე არ შეცვალოს. */}
                    <div className="-mx-3 -my-1 flex items-center gap-2 overflow-x-auto whitespace-nowrap px-3 py-1 [scrollbar-width:none] sm:-mx-4 sm:px-4 [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
                        {data.orders.length > 0 && (
                            <button
                                type="button"
                                data-tour="orders-select"
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
                                    ? "დასრულება"
                                    : "მონიშვნა"}
                            </button>
                        )}

                        {!selectionMode && (
                            <>
                                {data.invoiceCounts.new > 0 && (
                                    <a
                                        href="/print/orders?mode=new"
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

                                <OrderBulkStatusButtons
                                    processing={data.queueCounts.processing}
                                    shipped={data.queueCounts.shipped}
                                    onOpenOrder={orderId => void openOrderById(orderId)}
                                />
                            </>
                        )}

                        {selectionMode && (
                            <>
                                <span
                                    aria-live="polite"
                                    aria-label={`მონიშნულია ${checkedIds.length} შეკვეთა ${data.orders.length}-დან`}
                                    className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm tabular-nums"
                                >
                                    <span className="font-semibold text-text-primary">{checkedIds.length}</span>
                                    <span className="text-text-secondary">/{data.orders.length}</span>
                                </span>

                                <button
                                    type="button"
                                    onClick={openSelectedPrint}
                                    disabled={!checkedIds.length}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-40"
                                >
                                    <Icon
                                        icon="solar:documents-linear"
                                        className="h-5 w-5"
                                    />
                                    ბეჭდვა
                                </button>

                                <OrderBulkStatusButtons
                                    processing={data.queueCounts.processing}
                                    shipped={data.queueCounts.shipped}
                                    selection={{
                                        ids: checkedIds,
                                        canShip: checkedOrders.length > 0 && checkedOrders.every(order => order.status === "PROCESSING"),
                                        canComplete: checkedOrders.length > 0 && checkedOrders.every(order => order.status === "SHIPPED"),
                                    }}
                                    onOpenOrder={orderId => void openOrderById(orderId)}
                                />

                                <OrderBulkDeleteButton
                                    orderIds={checkedIds}
                                    knownOrders={data.orders.filter(order => checkedIds.includes(order.id))}
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

                    {/* {selectionMode && (
                        <p className="mt-2 text-xs text-text-secondary">
                            მონიშნეთ სასურველი შეკვეთები. სათაურის ჩეკბოქსი
                            ამ გვერდის ყველა შეკვეთას მონიშნავს.
                        </p>
                    )} */}

                    {printError && (
                        <p
                            role="alert"
                            className="mt-2 text-sm text-danger"
                        >
                            {printError}
                            <button type="button" className="ml-2 underline" disabled={pending}
                                onClick={() => window.dispatchEvent(new Event(ORDERS_CHANGED, { cancelable: true }))}>
                                სიის განახლება
                            </button>
                        </p>
                    )}
                </div>
                {pending ? (
                    <OrdersListSkeleton selectionMode={selectionMode} />
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
                                <th
                                    className="px-3 py-3 sm:px-4"
                                    style={{
                                        width: `calc(${Math.max(
                                            5,
                                            ...data.orders.map(order => number(order).length),
                                        ) + 1
                                            }ch + 5rem)`,
                                    }}
                                >
                                    შეკვეთა
                                </th>
                                <th className="hidden px-3 py-3 sm:table-cell">
                                    მიმღები
                                </th>
                                <th className="hidden w-[22%] px-3 py-3 lg:table-cell xl:w-[18%]">პროდუქტები</th>
                                <th className="w-[23%] px-2 py-3 sm:w-[15%] xl:w-[14%]">თანხა</th>
                                <th className="w-20 px-1 py-3 sm:w-[20%] xl:w-[18%]">
                                    სტატუსი
                                </th>
                                <th className="hidden w-[12%] px-2 py-3 xl:table-cell">გადახდა</th>
                                <th className="w-14 px-1 py-3">
                                    <span className="sr-only">დეტალები</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.orders.map(order => {
                                const image = order.items.find(
                                    item => Boolean(item.imageUrl),
                                )?.imageUrl;

                                const hasExtraInfo =
                                    order.hasNotes ||
                                    order.printState !== "PRINTED" ||
                                    order.pendingReturnQuantity > 0 ||
                                    order.receivedReturnQuantity > 0 ||
                                    Boolean(order.deleteRequestedAt) ||
                                    order.refundDue !== "0.00" ||
                                    order.hasPastReturns;

                                return (
                                    <tr
                                        key={order.id}
                                        // მონიშვნის რეჟიმში მთელი რიგი რთავს/თიშავს მონიშვნას; სამი წერტილი ისევ დეტალებს ხსნის.
                                        onClick={selectionMode && !pending ? () => toggleOrder(order.id) : undefined}
                                        className={`h-20 border-t border-border transition-colors ${selectionMode ? "cursor-pointer select-none " : ""}${selectionMode && checkedIds.includes(order.id)
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
                                                    onClick={event => event.stopPropagation()}
                                                    aria-label={`${number(order)} მონიშვნა`}
                                                    className="h-4 w-4 accent-accent"
                                                />
                                            </td>
                                        )}

                                        <td className="px-2 py-2 align-middle sm:px-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background sm:h-10 sm:w-10">
                                                    {image ? (
                                                        <ProductThumbnail
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

                                                <div className="min-w-0 flex-1">
                                                    <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-text-primary sm:text-sm">
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

                                        <td className="hidden min-w-0 overflow-hidden px-3 py-2 align-middle sm:table-cell">
                                            <p className="truncate text-sm font-medium text-text-primary">
                                                {recipient(order)}
                                            </p>
                                            <p
                                                title={order.shippingAddress || undefined}
                                                className="mt-1 block w-full min-w-0 max-w-full truncate text-xs text-text-secondary"
                                            >
                                                {[
                                                    order.deliveryZone && deliveryZoneLabel[order.deliveryZone],
                                                    order.shippingAddress?.trim().replace(/\s+/g, " "),
                                                ].filter(Boolean).join(" · ") || "-"}
                                            </p>
                                        </td>

                                        <td className="hidden px-3 py-2 align-middle lg:table-cell">
                                            <p className="truncate text-sm text-text-primary">
                                                {order.items[0]?.name || "-"}
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
                                            <div inert={selectionMode} className={selectionMode ? "pointer-events-none" : undefined}>
                                                <Status
                                                    onChanged={refreshOrder}
                                                    order={order}
                                                    onReturn={openOrderReturn}
                                                />
                                            </div>
                                        </td>

                                        <td className="hidden px-2 py-2 align-middle xl:table-cell">
                                            <p className="truncate text-xs text-text-secondary">
                                                {payments[order.paymentStatus]}
                                            </p>
                                        </td>

                                        <td className="px-1 py-2 align-middle">
                                            <button
                                                type="button"
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    void openDetails(order);
                                                }}
                                                aria-label={`${number(order)} დეტალები${hasExtraInfo
                                                    ? " - დამატებითი ინფორმაცია"
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
            {detailTarget && !selected && <div className="p-4 sm:p-6">
                <div className="dialog-head dialog-head-line -mx-4 -mt-4 -mb-3 flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
                    <h2 id="order-details-title" className="text-lg font-semibold">შეკვეთა {number(detailTarget)}</h2>
                    <button type="button" onClick={close} aria-label="დახურვა" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border"><Icon icon="solar:close-circle-linear" className="h-6 w-6" /></button>
                </div>
                {detailError ? <div role="alert" className="mt-4 text-sm text-danger">{detailError}<button type="button" onClick={() => void openDetails(detailTarget)} className="ml-3 text-accent underline">ხელახლა ცდა</button></div> : <div role="status" aria-label="შეკვეთის დეტალები იტვირთება" className="mt-5 animate-pulse space-y-4"><div className="h-12 rounded-xl bg-background" /><div className="h-24 rounded-xl bg-background" /><div className="h-32 rounded-xl bg-background" /></div>}
            </div>}
            {selected && <OrderDetailsBody order={selected} onClose={close} onChanged={refreshOrder} onReturn={openOrderReturn} onReadyToDelete={offerOrderDeletion} />}
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
