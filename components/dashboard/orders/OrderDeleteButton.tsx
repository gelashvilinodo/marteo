"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import { OrderActionError, sendOrderAction } from "@/lib/orders/order-actions-client";
import OrderReturnButton from "./OrderReturnButton";
import { useOrderLeaveGuard } from "./useOrderLeaveGuard";

type Order = Awaited<ReturnType<typeof getOrder>>;
type Mode = "WAIT_FOR_RETURN" | "RECEIVED" | "NO_RETURN";

export default function OrderDeleteButton({
    orderId,
    onDeleted,
    onDismiss,
    onReadyToDelete,
    autoOpen = false,
}: {
    orderId: string;
    onDeleted?: () => void;
    onDismiss?: () => void;
    onReadyToDelete?: (orderId: string) => void;
    autoOpen?: boolean;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const fetchController = useRef<AbortController | null>(null);
    const mutationController = useRef<AbortController | null>(null);
    const running = useRef(false);
    const [open, setOpen] = useState(autoOpen);
    const [loading, setLoading] = useState(autoOpen);
    const [saving, setSaving] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [mode, setMode] = useState<Mode | "">("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [pending, setPending] = useState<Record<string, unknown> | null>(null);

    const load = useCallback(async () => {
        fetchController.current?.abort();
        const controller = new AbortController(); fetchController.current = controller;
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store", signal: controller.signal });
            const result = await response.json() as { success?: boolean; order?: Order; message?: string };
            if (!response.ok || !result.success || !result.order) throw new Error(result.message || "შეკვეთა ვერ ჩაიტვირთა.");
            if (!controller.signal.aborted) setOrder(result.order);
        } catch (cause: unknown) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "შეკვეთა ვერ ჩაიტვირთა.");
        } finally { if (!controller.signal.aborted) setLoading(false); }
    }, [orderId]);
    useEffect(() => {
        let active = true;
        void Promise.resolve().then(() => {
            if (active && autoOpen) void load();
        });
        return () => {
            active = false;
            fetchController.current?.abort();
            mutationController.current?.abort();
        };
    }, [autoOpen, load]);
    useEffect(() => {
        const element = dialog.current;
        if (open && !element?.open) element?.showModal();
        if (!open && element?.open) element.close();
    }, [open]);
    function canLeave() {
        return !running.current && (!pending || window.confirm("წაშლის შედეგი დაუდასტურებელია. დაბრუნებისას იგივე მოთხოვნის ხელახლა ცდა შეგეძლება. დახურო ფანჯარა?"));
    }
    function leave() { fetchController.current?.abort(); setOpen(false); onDismiss?.(); }
    useOrderLeaveGuard({ open, dirty: Boolean(pending), canLeave, leave });
    function show() {
        setOpen(true);
        if (!pending) { setOrder(null); setLoading(true); setError(""); setNotice(""); setMode(""); void load(); }
    }
    const awaiting = order?.returns.some(entry => entry.status === "PENDING") ?? false;
    const fullyReturned = Boolean(order && (order.stockReturned || order.items.every(item => item.receivedReturnQuantity === item.quantity)));
    const hasOutstandingCarriedItems = Boolean(
        order?.items.some(
            item =>
                item.isCarriedOver &&
                item.receivedReturnQuantity < item.quantity,
        ),
    );

    const carriedItemsReceived = Boolean(
        order &&
        order.items
            .filter(item => item.isCarriedOver)
            .every(
                item => item.receivedReturnQuantity === item.quantity,
            ),
    );

    const simple = Boolean(
        order &&
        (
            fullyReturned ||
            order.status === "COMPLETED" ||
            (
                order.status === "PROCESSING" &&
                !hasOutstandingCarriedItems
            )
        ),
    );

    async function send(payload: Record<string, unknown>) {
        if (running.current) return;
        const controller = new AbortController(); mutationController.current = controller;
        running.current = true; setSaving(true); setError(""); setPending(payload);
        try {
            await sendOrderAction(
                orderId,
                payload.confirmCancelDeletion === true
                    ? "cancel-deletion"
                    : "delete",
                payload,
                controller.signal,
            );
            setPending(null);
            router.refresh();
            if (payload.confirmCancelDeletion === true) {
                setMode("");
                setNotice(
                    "წაშლის მოთხოვნა გაუქმებულია. შეკვეთა შენარჩუნდა; დაბრუნების მოთხოვნები და მარაგი არ შეცვლილა.",
                );
                await load();
            } else if (payload.mode === "WAIT_FOR_RETURN") {
                setNotice("წაშლის მოთხოვნა შენახულია. შეკვეთა დაბრუნების მოლოდინში დარჩება.");
                await load();
            } else {
                setOpen(false);
                onDeleted?.();
            }
        } catch (cause: unknown) {
            if (cause instanceof OrderActionError && cause.status < 500) {
                setPending(null); setError(cause.message);
            } else setError("შედეგი დაუდასტურებელია. იგივე მოთხოვნით სცადე ხელახლა.");
        } finally { mutationController.current = null; running.current = false; setSaving(false); }
    }
    function submit() {
        if (!order || pending || saving) return;
        if (awaiting && mode !== "WAIT_FOR_RETURN") { setError("ჯერ დაადასტურე დასაბრუნებელი ნივთების მიღება."); return; }
        if (mode === "WAIT_FOR_RETURN" && !awaiting) { setError("ჯერ დაბრუნების ღილაკით აირჩიე ნივთები და შეინახე დაბრუნების მოთხოვნა."); return; }
        if (!simple && !mode) { setError("აირჩიე, რა ხდება პროდუქტების დაბრუნებასთან დაკავშირებით."); return; }
        const receivedEnough = order.status === "PROCESSING"
            ? carriedItemsReceived
            : fullyReturned;

        if (
            mode === "RECEIVED" &&
            !receivedEnough &&
            order.status !== "COMPLETED"
        ) {
            setError(
                "ჯერ დაბრუნების ფანჯარაში დაადასტურე კლიენტთან არსებული ნივთების ფიზიკური მიღება.",
            );
            return;
        }
        if (mode === "NO_RETURN" && !window.confirm("დარჩენილი ნივთები აღარ დაბრუნდება და მარაგს არ დაემატება. დაადასტურო წაშლა?")) return;
        void send({
            requestId: crypto.randomUUID(), expectedVersion: order.expectedVersion, confirmDeletion: true,
            mode: mode || (fullyReturned ? "RECEIVED" : undefined), confirmNoReturn: mode === "NO_RETURN",
        });
    }
    const blocked = loading || saving || Boolean(pending);

    return <>
        {!autoOpen && <button type="button" onClick={show} title="შეკვეთის წაშლა" aria-label="შეკვეთის წაშლა" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-danger/25 text-danger hover:bg-danger/10"><Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5" /></button>}
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (canLeave()) leave(); }} onClose={event => event.stopPropagation()} aria-label="შეკვეთის წაშლა" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon icon="solar:trash-bin-trash-linear" className="h-6 w-6 text-danger" />შეკვეთის წაშლა</h2>
            {loading && <p role="status" className="my-5 flex items-center gap-2 text-sm text-text-secondary"><Icon icon="solar:refresh-linear" className="h-5 w-5 animate-spin" />იტვირთება…</p>}
            {!loading && order && <div className="mt-4 space-y-4">
                <p className="text-sm">შეკვეთა {order.number === null ? "" : `#${String(order.number).padStart(4, "0")}`}</p>
                <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                    {fullyReturned
                        ? "დაბრუნება უკვე აღრიცხულია. წაშლისას მარაგი მეორედ აღარ გაიზრდება."
                        : order.status === "PROCESSING"
                            ? hasOutstandingCarriedItems
                                ? "ჯერ გასაგზავნი პროდუქტები მარაგს დაუბრუნდება. კლიენტთან დარჩენილ პროდუქტებზე მიუთითე, დაბრუნდება თუ არა ისინი."
                                : "წაშლისას ჯერ გასაგზავნი, მარაგიდან არჩეული პროდუქტები მარაგს დაუბრუნდება."
                            : order.status === "COMPLETED"
                                ? "შეკვეთა დასრულებულია. წაშლისას გაყიდული პროდუქტები მარაგს არ დაუბრუნდება."
                                : "წაშლამდე მიუთითე, დაბრუნდა თუ არა პროდუქტები და იგეგმება თუ არა მათი დაბრუნება."}
                    {" "}
                    შეკვეთა სიიდან დაიმალება და მისი საჯარო ბმული გაუქმდება.
                </p>
                {(!simple || awaiting) && <fieldset disabled={blocked} className="space-y-2 disabled:opacity-50"><legend className="mb-2 text-sm font-medium">პროდუქტების დაბრუნება</legend>{([
                    ["RECEIVED", "ნივთები უკვე დაბრუნდა"],
                    ["WAIT_FOR_RETURN", "ნივთები უნდა დაბრუნდეს — დაველოდოთ"],
                    ["NO_RETURN", "ნივთები აღარ დაბრუნდება"],
                ] as const).map(([value, label]) => <label key={value} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${mode === value ? "border-accent bg-accent/5" : "border-border"}`}><input type="radio" name={`delete-mode-${orderId}`} checked={mode === value} onChange={() => { setMode(value); setError(""); }} className="h-4 w-4 accent-accent" />{label}</label>)}</fieldset>}
                {(awaiting || mode === "RECEIVED" || mode === "WAIT_FOR_RETURN") && <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3"><p className="text-xs text-text-secondary">{awaiting ? "დაბრუნების მოთხოვნა არსებობს. აქედან დაადასტურე ფიზიკური მიღება." : "აქედან აირჩიე დასაბრუნებელი ნივთები და შეინახე მოთხოვნა. მიღება მხოლოდ ფიზიკური დაბრუნების შემდეგ დაადასტურე."}</p><OrderReturnButton
                    orderId={orderId}
                    onUpdated={() => {
                        void load();
                    }}
                    onReadyToDelete={onReadyToDelete}
                    onDeleted={() => {
                        setOpen(false);
                        onDeleted?.();
                    }}
                /></div>}
                {order.deleteRequestedAt && (
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                        <p className="text-sm font-medium text-warning">
                            წაშლის მოთხოვნა შენახულია
                        </p>

                        <p className="mt-1 text-xs text-text-secondary">
                            თუ წაშლა გადაიფიქრე, გააუქმე მხოლოდ წაშლის
                            მოთხოვნა. შეკვეთა დარჩება, ხოლო ნივთების
                            დაბრუნების პროცესი გაგრძელდება.
                        </p>

                        <button
                            type="button"
                            disabled={blocked}
                            onClick={() => {
                                if (!window.confirm(
                                    "გააუქმო წაშლის მოთხოვნა? შეკვეთა დარჩება, დაბრუნების მოთხოვნები არ გაუქმდება.",
                                )) {
                                    return;
                                }

                                void send({
                                    requestId: crypto.randomUUID(),
                                    expectedVersion: order.expectedVersion,
                                    confirmCancelDeletion: true,
                                });
                            }}
                            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent/30 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
                        >
                            <Icon
                                icon="solar:undo-left-round-linear"
                                className="h-4 w-4 shrink-0"
                            />
                            წაშლის მოთხოვნის გაუქმება
                        </button>
                    </div>
                )}
            </div>}
            {notice && <p role="status" className="mt-4 rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
            {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
            {!loading && !order && !pending && <button type="button" onClick={() => { setLoading(true); setError(""); void load(); }} className="mt-3 text-sm text-accent underline">ხელახლა ჩატვირთვა</button>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={saving} onClick={() => { if (canLeave()) leave(); }} className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40">დახურვა</button>{saving && <button type="button" onClick={() => mutationController.current?.abort()} className="text-xs text-text-secondary underline">შეაჩერე ლოდინი</button>}<button type="button" disabled={loading || saving || (!order && !pending)} onClick={() => pending ? void send(pending) : submit()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"><Icon icon={saving ? "solar:refresh-linear" : "solar:trash-bin-trash-linear"} className={`h-5 w-5 ${saving ? "animate-spin" : ""}`} />{saving ? "ინახება…" : pending ? "ხელახლა ცდა" : mode === "WAIT_FOR_RETURN" ? "წაშლის მოთხოვნა" : "წაშლა"}</button></div>
        </dialog>
    </>;
}
