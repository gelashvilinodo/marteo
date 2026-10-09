"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import { OrderActionError, sendOrderAction } from "@/lib/orders/order-actions-client";
import { useOrderLeaveGuard } from "./useOrderLeaveGuard";

type Order = Awaited<ReturnType<typeof getOrder>>;
type Row = {
    id: string;
    label: string;
    state: "READY" | "REVIEW" | "DELETED" | "ERROR" | "UNCERTAIN";
    message: string;
    payload?: Record<string, unknown>;
};

export default function OrderBulkDeleteButton({
    orderIds,
    onDeleted,
    onReview,
}: {
    orderIds: string[];
    onDeleted: (ids: string[]) => void;
    onReview: (orderId: string) => void;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const controller = useRef<AbortController | null>(null);
    const running = useRef(false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState<Row[]>([]);

    useEffect(() => {
        const element = dialog.current;
        if (open && !element?.open) element?.showModal();
        if (!open && element?.open) element.close();
    }, [open]);
    useEffect(() => () => controller.current?.abort(), []);

    const uncertain = rows.some(row => row.state === "UNCERTAIN");
    function canLeave() {
        if (running.current) return false;
        return !uncertain || window.confirm(
            "ზოგი წაშლის შედეგი ჯერ დაუდასტურებელია. იგივე მოთხოვნით ხელახლა ცდა ამ ფანჯარაში შეგიძლია. დახურო?",
        );
    }
    function leave() { setOpen(false); }
    useOrderLeaveGuard({ open, dirty: busy || uncertain, canLeave, leave });

    async function inspect(id: string, signal: AbortSignal): Promise<Row> {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
            cache: "no-store",
            signal,
        });
        const result = await response.json() as {
            success?: boolean;
            message?: string;
            order?: Order;
        };
        if (!response.ok || !result.success || !result.order) {
            throw new Error(result.message || "შეკვეთა ვერ ჩაიტვირთა.");
        }
        const order = result.order;
        const label = order.number === null ? id : `#${String(order.number).padStart(4, "0")}`;
        const pending = order.returns.some(entry => entry.status === "PENDING");
        const fullyReturned = order.stockReturned || (
            order.items.length > 0 && order.items.every(
                item => item.receivedReturnQuantity === item.quantity,
            )
        );
        const hasOutstandingCarriedItems =
            order.status === "PROCESSING" &&
            order.items.some(
                item =>
                    item.isCarriedOver &&
                    item.receivedReturnQuantity < item.quantity,
            );

        if (hasOutstandingCarriedItems) {
            return {
                id,
                label,
                state: "REVIEW",
                message:
                    "კლიენტთან დარჩენილი პროდუქტებია. გახსენი წაშლის ფანჯარა და მიუთითე, დაბრუნდება თუ არა ისინი.",
            };
        }
        if (pending) {
            return { id, label, state: "REVIEW", message: "ნივთების დაბრუნებას ველოდებით. ჯერ დაადასტურე ფიზიკური მიღება." };
        }
        if (order.status !== "PROCESSING" && order.status !== "COMPLETED" && !fullyReturned) {
            return { id, label, state: "REVIEW", message: "წაშლამდე მიუთითე, დაბრუნდება თუ არა დარჩენილი ნივთები." };
        }
        return {
            id,
            label,
            state: "READY",
            message: fullyReturned
                ? "დაბრუნება უკვე აღრიცხულია; მარაგი მეორედ არ გაიზრდება."
                : order.status === "PROCESSING"
                    ? "მარაგიდან არჩეული ნივთები მარაგს დაუბრუნდება."
                    : "შეკვეთა დასრულებულია; მარაგი არ შეიცვლება.",
            payload: {
                requestId: crypto.randomUUID(),
                expectedVersion: order.expectedVersion,
                confirmDeletion: true,
                ...(fullyReturned ? { mode: "RECEIVED" } : {}),
            },
        };
    }

    async function show() {
        if (running.current || !orderIds.length) return;
        // Keep unresolved requests intact, including their original request IDs.
        if (rows.some(row => row.state === "UNCERTAIN")) {
            setOpen(true);
            return;
        }
        const ids = [...new Set(orderIds)];
        const abort = new AbortController();
        controller.current = abort;
        running.current = true;
        setOpen(true);
        setBusy(true);
        setRows([]);
        const inspected: Row[] = [];
        try {
            for (const id of ids) {
                try {
                    inspected.push(await inspect(id, abort.signal));
                } catch (cause: unknown) {
                    if (abort.signal.aborted) break;
                    inspected.push({ id, label: id, state: "ERROR", message: cause instanceof Error ? cause.message : "ჩატვირთვა ვერ შესრულდა." });
                }
                setRows([...inspected]);
            }
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    async function remove() {
        if (running.current) return;
        const targets = rows.filter(row => row.state === "READY" || row.state === "UNCERTAIN");
        if (!targets.length) return;
        const abort = new AbortController();
        controller.current = abort;
        running.current = true;
        setBusy(true);
        const deleted: string[] = [];
        try {
            for (const row of targets) {
                if (abort.signal.aborted) break;
                try {
                    await sendOrderAction(row.id, "delete", row.payload!, abort.signal);
                    deleted.push(row.id);
                    setRows(current => current.map(value => value.id === row.id
                        ? { ...value, state: "DELETED", message: "შეკვეთა წაშლილია." }
                        : value));
                } catch (cause: unknown) {
                    const definite = cause instanceof OrderActionError && cause.status < 500;
                    setRows(current => current.map(value => value.id === row.id
                        ? {
                            ...value,
                            state: definite ? "REVIEW" : "UNCERTAIN",
                            message: definite ? cause.message : "შედეგი დაუდასტურებელია. იგივე მოთხოვნით სცადე ხელახლა.",
                        }
                        : value));
                    if (abort.signal.aborted) break;
                }
            }
        } finally {
            if (deleted.length) onDeleted(deleted);
            router.refresh();
            running.current = false;
            setBusy(false);
        }
    }

    const actionable = rows.filter(row => row.state === "READY" || row.state === "UNCERTAIN").length;
    return <>
        <button
            type="button"
            onClick={() => void show()}
            disabled={!orderIds.length || busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-danger/30 px-3 text-sm font-medium text-danger disabled:opacity-40"
        >
            <Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5" />
            მონიშნულების წაშლა
        </button>
        <dialog
            ref={dialog}
            onCancel={event => { event.preventDefault(); event.stopPropagation(); if (canLeave()) leave(); }}
            onClose={event => event.stopPropagation()}
            aria-label="მონიშნული შეკვეთების წაშლა"
            className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon icon="solar:trash-bin-trash-linear" className="h-6 w-6 text-danger" />
                მონიშნული შეკვეთების წაშლა
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
                გადაამოწმე, რა მოხდება თითოეულ შეკვეთაზე. წაშლილი შეკვეთები სიიდან დაიმალება და მათი საჯარო ბმულები გაუქმდება.
                დამატებითი გადაწყვეტილების საჭიროებისას შეკვეთა დარჩება.
            </p>
            {busy && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-accent"><Icon icon="solar:refresh-linear" className="h-5 w-5 animate-spin" />მიმდინარეობს დამუშავება…</p>}
            <div aria-live="polite" className="mt-4 space-y-2">
                {rows.map(row => <article key={row.id} className="rounded-xl border border-border p-3">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className={`mt-1 text-xs ${row.state === "DELETED" ? "text-success" : row.state === "READY" ? "text-text-secondary" : "text-warning"}`}>{row.message}</p>
                    {(row.state === "REVIEW" || row.state === "ERROR") && <button
                        type="button"
                        disabled={busy}
                        onClick={() => { if (canLeave()) { leave(); onReview(row.id); } }}
                        className="mt-2 min-h-10 text-sm font-medium text-accent underline disabled:opacity-40"
                    >გადაწყვეტილების მითითება</button>}
                </article>)}
            </div>
            <footer className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <button type="button" disabled={busy} onClick={() => { if (canLeave()) leave(); }} className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40">დახურვა</button>
                {busy && <button type="button" onClick={() => controller.current?.abort()} className="text-xs text-text-secondary underline">შეაჩერე ლოდინი</button>}
                {actionable > 0 && <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-40">
                    <Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5" />
                    {uncertain ? "ხელახლა ცდა" : `წაშლის დადასტურება (${actionable})`}
                </button>}
            </footer>
        </dialog>
    </>;
}
