"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import { OrderActionError, sendOrderAction } from "@/lib/orders/order-actions-client";
import type { ReturnSelection } from "@/lib/orders/order-returns";
import { useOrderLeaveGuard } from "./useOrderLeaveGuard";
import OrderDeleteButton from "./OrderDeleteButton";
import OrderExchangeEditor from "./OrderExchangeEditor";

type Order = Awaited<ReturnType<typeof getOrder>>;
type Choice = ReturnSelection & { selected: boolean; quantityText: string };
const field = "h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent";
const reasons = { DEFECT: "წუნი", EXCHANGE: "გადაცვლა", OTHER: "სხვა" };

export default function OrderReturnButton({
    orderId,
    onUpdated,
    onDeleted,
    onReadyToDelete,
    autoOpen = false,
    onDismiss,
}: {
    orderId: string;
    onUpdated?: () => void;
    onDeleted?: () => void;
    onReadyToDelete?: (orderId: string) => void;
    autoOpen?: boolean;
    onDismiss?: () => void;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const loadController = useRef<AbortController | null>(null);
    const saveController = useRef<AbortController | null>(null);
    const running = useRef(false);
    const [open, setOpen] = useState(autoOpen);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [choices, setChoices] = useState<Choice[]>([]);
    const [dirty, setDirty] = useState(false);
    const [exchangeEditing, setExchangeEditing] =
        useState(false);

    const [exchangeUploading, setExchangeUploading] =
        useState(false);

    const [pendingAction, setPendingAction] =
        useState<"return" | "exchange">("return");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [pending, setPending] = useState<Record<string, unknown> | null>(null);
    const [offerDeletion, setOfferDeletion] = useState(false);

    useEffect(() => {
        const element = dialog.current;
        if (open && !element?.open) element?.showModal();
        if (!open && element?.open) element.close();
    }, [open]);
    useEffect(() => () => { loadController.current?.abort(); saveController.current?.abort(); }, []);

    function canLeave() {
        if (running.current) return false;

        if (exchangeUploading) {
            window.alert(
                "ფოტო ჯერ იტვირთება. დაელოდე დასრულებას ან შეწყვიტე ატვირთვა.",
            );
            return false;
        }

        return !(dirty || pending) || window.confirm(
            pending
                ? "შედეგი დაუდასტურებელია. იგივე მოთხოვნის ხელახლა ცდა ამ ფანჯრიდან შეგიძლია. დახურო?"
                : "ცვლილებები შენახული არ არის. დახურო და დაკარგო ცვლილებები?",
        );
    }
    function leave() {
        loadController.current?.abort();

        if (!pending) {
            setChoices([]);
            setDirty(false);
            setOrder(null);
        }

        setOpen(false);
        onDismiss?.();
    }
    useOrderLeaveGuard({ open, dirty: dirty || Boolean(pending), canLeave, leave });

    const load = useCallback(async () => {
        loadController.current?.abort();
        const controller = new AbortController();
        loadController.current = controller;
        setLoading(true); setError("");
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store", signal: controller.signal });
            const result = await response.json() as { success?: boolean; message?: string; order?: Order };
            if (!response.ok || !result.success || !result.order) throw new Error(result.message || "შეკვეთა ვერ ჩაიტვირთა.");
            if (controller.signal.aborted) return;
            const data = result.order;
            setOrder(data);
            const eligible = data.items.filter(item => item.returnableQuantity > 0);
            setChoices(eligible.map(item => ({
                orderItemId: item.id, quantity: item.returnableQuantity,
                quantityText: String(item.returnableQuantity),
                selected: eligible.length === 1,
                reason: "OTHER", condition: item.condition, note: "",
            })));
            setDirty(false);
            return data;
        } catch (cause: unknown) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "შეკვეთა ვერ ჩაიტვირთა.");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [orderId]);

    useEffect(() => {
        if (!autoOpen) return;

        const timer = setTimeout(() => {
            void load();
        }, 0);

        return () => clearTimeout(timer);
    }, [autoOpen, load]);

    function show() {
        setOpen(true);
        setNotice("");

        if (!pending) {
            void load();
        }
    }
    function patch(id: string, values: Partial<Choice>) {
        setChoices(current => current.map(item => item.orderItemId === id ? { ...item, ...values } : item));
        setDirty(true); setError("");
    }
    async function send(
        payload: Record<string, unknown>,
        action: "return" | "exchange" = "return",
    ) {
        setPendingAction(action);
        if (running.current) return;
        const controller = new AbortController();
        saveController.current = controller;
        running.current = true; setSaving(true); setError(""); setPending(payload);
        try {
            const result = await sendOrderAction(
                orderId,
                action,
                payload,
                controller.signal,
            );
            setPending(null);
            setDirty(false);

            if (action === "exchange") {
                setExchangeEditing(false);
                setExchangeUploading(false);
                setOrder(null);
            }

            setNotice(
                action === "exchange"
                    ? "გადაცვლა შენახულია. შეკვეთა გადავიდა „მუშავდება“-ზე."
                    : payload.action === "receive"
                        ? "დაბრუნება დადასტურებულია."
                        : "დაბრუნების მოთხოვნა შენახულია. მარაგი მიღების დადასტურებამდე უცვლელია.",
            );
            const shouldOfferDeletion =
                action === "return" &&
                payload.action === "receive" &&
                result.readyToDelete === true;

            if (shouldOfferDeletion) {
                if (onReadyToDelete) {
                    onReadyToDelete(orderId);
                } else {
                    setOfferDeletion(true);
                }

                router.refresh();
                return;
            }

            await load();
            onUpdated?.();
            router.refresh();
        } catch (cause: unknown) {
            const definite = cause instanceof OrderActionError && cause.status < 500;
            if (definite) setPending(null);
            setError(definite && cause instanceof Error ? cause.message : "შედეგი დაუდასტურებელია. იგივე მოთხოვნით სცადე ხელახლა.");
        } finally { saveController.current = null; running.current = false; setSaving(false); }
    }
    function submit() {
        if (!order || !order.canRequestReturn || pending) return;
        const selected = choices.filter(item => item.selected);
        if (!selected.length) { setError("მონიშნე დასაბრუნებელი პროდუქტი."); return; }
        for (const choice of selected) {
            const item = order.items.find(value => value.id === choice.orderItemId);
            const quantity = Number(choice.quantityText);
            if (!/^\d+$/.test(choice.quantityText) || !Number.isSafeInteger(quantity) || quantity < 1 || !item || quantity > item.returnableQuantity) {
                setError(`${item?.name ?? "პროდუქტი"}: მიუთითე დასაბრუნებელი რაოდენობა 1-დან ${item?.returnableQuantity ?? 0}-მდე.`); return;
            }
        }
        void send({
            requestId: crypto.randomUUID(), action: "request", expectedVersion: order.expectedVersion,
            items: selected.map(item => ({ orderItemId: item.orderItemId, quantity: Number(item.quantityText), reason: item.reason, condition: item.condition, note: item.note ?? "" })),
        });
    }
    function receive(entry: Order["returns"][number]) {
        if (!order || pending || saving) return;
        if (dirty && !window.confirm("ახალი მოთხოვნის შეუნახავი ცვლილებები დაიკარგება. გააგრძელო?")) return;
        const names = entry.items.map(item => `${item.name} — ${item.quantity} (${item.condition === "DEFECTIVE" ? "წუნდებული" : "დაუზიანებელი"})`).join("\n");
        if (!window.confirm(`ადასტურებ, რომ ფიზიკურად მიიღე ეს ნივთები მითითებული მდგომარეობით?\n\n${names}\n\nმარაგიდან გაყიდული ნივთები შესაბამის მარაგს დაემატება.`)) return;
        void send({ requestId: crypto.randomUUID(), action: "receive", returnId: entry.id, expectedVersion: order.expectedVersion, confirmReceived: true });
    }
    const blocked =
        saving ||
        loading ||
        Boolean(pending) ||
        exchangeEditing;
    const allSelected = choices.length > 0 && choices.every(item => item.selected);

    return <>
        {offerDeletion && (
            <OrderDeleteButton
                orderId={orderId}
                autoOpen
                onDismiss={() => setOfferDeletion(false)}
                onDeleted={() => {
                    setOfferDeletion(false);
                    setOpen(false);
                    onDeleted?.();
                }}
            />
        )}
        {!autoOpen && (
            <button
                type="button"
                onClick={show}
                aria-label="დაბრუნების მართვა"
                title="დაბრუნების მართვა"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-accent hover:bg-accent/10"
            >
                <Icon
                    icon="solar:undo-left-round-linear"
                    className="h-5 w-5"
                />
            </button>
        )}
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (canLeave()) leave(); }} onClose={event => event.stopPropagation()} aria-label="პროდუქტების დაბრუნება" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-border bg-background p-0 text-text-primary shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm">
            <div className="flex max-h-[90dvh] min-h-0 flex-col">
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface p-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Icon icon="solar:undo-left-round-linear" className="h-5 w-5 text-accent" />პროდუქტების დაბრუნება</h2><button type="button" disabled={saving} aria-label="დაბრუნების ფანჯრის დახურვა" onClick={() => { if (canLeave()) leave(); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border disabled:opacity-40"><Icon icon="solar:close-circle-linear" className="h-5 w-5" /></button></header>
                <div className="min-h-0 space-y-4 overflow-y-auto p-4">
                    {loading && <div role="status" className="flex items-center justify-center gap-2 py-8 text-text-secondary"><Icon icon="solar:refresh-linear" className="h-5 w-5 animate-spin" />იტვირთება…</div>}
                    {notice && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
                    {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
                    {!loading && !order && <button type="button" onClick={() => void load()} className="text-sm text-accent underline">ხელახლა ჩატვირთვა</button>}
                    {!loading && order && <>
                        {order.canExchange && (
                            <OrderExchangeEditor
                                key={`${order.id}-${order.expectedVersion}`}
                                order={order}
                                blocked={
                                    saving ||
                                    loading ||
                                    Boolean(pending)
                                }
                                onStart={() => {
                                    if (
                                        dirty &&
                                        !window.confirm(
                                            "ახალი დაბრუნების შეუნახავი ცვლილებები დაიკარგება. გადახვიდე გადაცვლაზე?",
                                        )
                                    ) {
                                        return false;
                                    }

                                    setDirty(false);
                                    setExchangeEditing(true);
                                    return true;
                                }}
                                onCancel={() => {
                                    if (!canLeave()) return false;

                                    setExchangeEditing(false);
                                    setDirty(false);
                                    void load();

                                    return true;
                                }}
                                onDirty={() => {
                                    setDirty(true);
                                }}
                                onUploading={setExchangeUploading}
                                onSubmit={items => {
                                    void send(
                                        {
                                            requestId: crypto.randomUUID(),
                                            expectedVersion: order.expectedVersion,
                                            items,
                                        },
                                        "exchange",
                                    );
                                }}
                            />
                        )}
                        {order.returns.length > 0 && <section className="space-y-3"><h3 className="text-sm font-semibold">დაბრუნების მოთხოვნები</h3>{order.returns.map(entry => <article key={entry.id} className="rounded-xl border border-border bg-surface p-3"><p className={`mb-2 text-sm font-medium ${entry.status === "PENDING" ? "text-warning" : entry.status === "RECEIVED" ? "text-success" : "text-text-secondary"}`}>{entry.status === "PENDING" ? "დაბრუნების მოლოდინში" : entry.status === "RECEIVED" ? "დაბრუნება მიღებულია" : "მოთხოვნა გაუქმებულია"}</p>{entry.items.map(item => <div key={item.id} className="flex items-center gap-3 py-2">{item.imageUrl ? <Image src={item.imageUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <Icon icon="solar:box-linear" className="h-10 w-10 shrink-0 p-2 text-text-secondary" />}<div className="min-w-0"><p className="break-words text-sm">{item.name} · {item.quantity}</p><p className="text-xs text-text-secondary">{reasons[item.reason]} · {item.condition === "DEFECTIVE" ? "წუნდებული" : "დაუზიანებელი"}</p>{item.note && <p className="break-words text-xs text-text-secondary">{item.note}</p>}</div></div>)}{entry.status === "PENDING" && <button type="button" disabled={blocked} onClick={() => receive(entry)} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-success px-3 text-sm font-medium text-white disabled:opacity-50"><Icon icon="solar:check-circle-linear" className="h-5 w-5" />ნივთები მივიღე</button>}</article>)}</section>}
                        {order.canRequestReturn && !exchangeEditing && <fieldset disabled={blocked} className="min-w-0 space-y-3 disabled:opacity-60"><legend className="mb-3 text-sm font-semibold">ახალი დაბრუნების მოთხოვნა</legend>{order.items.length > 1 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} onChange={event => { setChoices(current => current.map(item => ({ ...item, selected: event.target.checked }))); setDirty(true); }} className="h-4 w-4 accent-[var(--marteo-accent)]" />ყველას მონიშვნა</label>}{choices.map(choice => {
                            const item = order.items.find(value => value.id === choice.orderItemId)!;
                            return <article key={item.id} className={`min-w-0 rounded-xl border bg-surface p-3 ${choice.selected ? "border-accent" : "border-border"}`}><div className="flex items-center gap-3">{order.items.length > 1 && <input type="checkbox" checked={choice.selected} onChange={event => patch(item.id, { selected: event.target.checked })} aria-label={`${item.name} — მონიშვნა`} className="h-4 w-4 shrink-0 accent-[var(--marteo-accent)]" />}{item.imageUrl ? <Image src={item.imageUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <Icon icon="solar:box-linear" className="h-12 w-12 shrink-0 rounded-xl bg-background p-3 text-text-secondary" />}<div className="min-w-0"><p className="break-words text-sm font-medium">{item.name}</p><p className="text-xs text-text-secondary">{[item.color, item.size].filter(Boolean).join(" · ")}</p><p className="text-xs text-text-secondary">დასაბრუნებელი: {item.returnableQuantity}</p></div></div>{choice.selected && <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3"><label className="min-w-0"><span className="mb-1 block text-xs text-text-secondary">რაოდენობა</span><input aria-label={`${item.name} — რაოდენობა`} inputMode="numeric" value={choice.quantityText} onChange={event => patch(item.id, { quantityText: event.target.value })} className={field} /></label><label className="min-w-0"><span className="mb-1 block text-xs text-text-secondary">მიზეზი</span><select aria-label={`${item.name} — მიზეზი`} value={choice.reason} onChange={event => patch(item.id, { reason: event.target.value as Choice["reason"] })} className={field}><option value="OTHER">სხვა</option><option value="DEFECT">წუნი</option><option value="EXCHANGE">გადაცვლა</option></select></label><label className="min-w-0"><span className="mb-1 block text-xs text-text-secondary">მდგომარეობა</span><select aria-label={`${item.name} — მდგომარეობა`} value={choice.condition} onChange={event => patch(item.id, { condition: event.target.value as Choice["condition"] })} className={field}><option value="GOOD">დაუზიანებელი</option><option value="DEFECTIVE">წუნდებული</option></select></label><label className="min-w-0 sm:col-span-3"><span className="mb-1 block text-xs text-text-secondary">განმარტება</span><textarea aria-label={`${item.name} — განმარტება`} value={choice.note ?? ""} onChange={event => patch(item.id, { note: event.target.value })} className="min-h-20 w-full min-w-0 rounded-xl border border-border bg-background p-3 text-[16px] outline-none focus:border-accent" /></label></div>}</article>;
                        })}<p className="text-xs text-text-secondary">მოთხოვნის შექმნა მარაგს არ ცვლის. მდგომარეობა მიუთითე იმის მიხედვით, თუ როგორ უნდა დაბრუნდეს ნივთი მარაგში.</p></fieldset>}
                        {!order.canRequestReturn && !order.canExchange && !order.returns.some(entry => entry.status === "PENDING") && <p className="text-sm text-text-secondary">ამ შეკვეთაზე ახალი დაბრუნების მოთხოვნა ხელმისაწვდომი არ არის.</p>}
                    </>}
                </div>
                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-surface p-4">{saving && <button type="button" onClick={() => saveController.current?.abort()} className="text-xs text-text-secondary underline">შეაჩერე ლოდინი</button>}<button type="button" disabled={saving} onClick={() => { if (canLeave()) leave(); }} className="h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-40">დახურვა</button>{pending ? <button type="button" disabled={saving} onClick={() => void send(pending, pendingAction)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"><Icon icon="solar:refresh-linear" className={`h-5 w-5 ${saving ? "animate-spin" : ""}`} />{saving ? "ინახება…" : "ხელახლა ცდა"}</button> : order?.canRequestReturn && !exchangeEditing && <button type="button" disabled={blocked} onClick={submit} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"><Icon icon="solar:undo-left-round-linear" className="h-5 w-5" />მოთხოვნის შენახვა</button>}</footer>
            </div>
        </dialog>
    </>;
}