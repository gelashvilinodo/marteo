"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { useNewOrder } from "./NewOrderProvider";
import OrderProductEditor from "./OrderProductEditor";
import OrderInventoryPicker from "./OrderInventoryPicker";
import OrderInvoiceButton from "./OrderInvoiceButton";
import { useOrderLeaveGuard } from "./useOrderLeaveGuard";
import {
    orderEditDraft,
    orderEditPayload,
} from "@/lib/orders/order-edit-form";

import {
    OrderActionError,
    sendOrderAction,
} from "@/lib/orders/order-actions-client";
import {
    emptyOrderDraft, inventoryOrderItem, lookupPhone, manualOrderItem, moneyCents, moneyText, orderCreatePayload, orderFormTotals,
    type InventoryOrderProduct, type OrderCreatePayload, type OrderFormDraft, type OrderFormItem, type PaidMode
} from "@/lib/orders/order-form";

const input = "h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none placeholder:text-text-secondary focus:border-accent lg:h-10 lg:text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block min-w-0"><span className="mb-1 block text-xs text-text-secondary">{label}</span>{children}</label>;
}
type PendingOrderSave =
    | {
        kind: "create";
        payload: OrderCreatePayload;
    }
    | {
        kind: "edit";
        orderId: string;
        payload: ReturnType<typeof orderEditPayload>;
    };
class SaveError extends Error { constructor(message: string, public status: number) { super(message); } }

export default function NewOrderDrawer() {
    const {
        isOpen,
        editingOrder,
        closeNewOrder,
        holdOrderSession,
    } = useNewOrder();
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [draft, setDraft] = useState<OrderFormDraft>(emptyOrderDraft);
    const [paidMode, setPaidMode] = useState<PaidMode>("none");
    const [dirty, setDirty] = useState(false);
    const [removingProduct, setRemovingProduct] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pending, setPending] =
        useState<PendingOrderSave | null>(null);
    const [error, setError] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [customerInfo, setCustomerInfo] = useState("");
    const [customerBusy, setCustomerBusy] = useState(false);
    const [lookupRevision, setLookupRevision] = useState(0);
    const [saved, setSaved] = useState<{ id: string; number: number | null } | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const productList = useRef<HTMLDivElement>(null);
    const productNumber = useRef(0);
    const draftRef = useRef(draft);
    const requestId = useRef<string | null>(null);
    const request = useRef<AbortController | null>(null);
    const requestBusy = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoFilled = useRef<{ phone: string; firstName: string; lastName: string; address: string } | null>(null);
    const formId = useId();
    const headingId = useId();
    const blocked =
        saving ||
        Boolean(pending) ||
        removingProduct;
    const photosUploading = draft.items.some(
        item => item.uploadPending,
    );
    const totals = orderFormTotals(
        draft,
        editingOrder ? "custom" : paidMode,
    );

    const productsLocked = Boolean(
        editingOrder && !editingOrder.productsEditable,
    );
    const initializedEdit = useRef<string | null>(null);
    useEffect(() => {
        holdOrderSession(Boolean(pending));
    }, [pending, holdOrderSession]);

    useEffect(() => {
        if (!isOpen) {
            initializedEdit.current = null;
            return;
        }

        if (!editingOrder || pending) return;

        const identity =
            `${editingOrder.id}:${editingOrder.expectedVersion}`;

        if (initializedEdit.current === identity) return;

        let active = true;

        void Promise.resolve().then(() => {
            if (!active) return;

            initializedEdit.current = identity;

            const initialDraft = orderEditDraft(editingOrder);
            initialDraft.items = initialDraft.items.map(
                (item, index) => ({
                    ...item,
                    displayNumber: index + 1,
                }),
            );

            productNumber.current = initialDraft.items.length;

            setDraft(initialDraft);
            draftRef.current = initialDraft;
            setPaidMode("custom");
            setDirty(false);
            setError("");
            setPickerOpen(false);
            setCustomerInfo("");
            setCustomerBusy(false);
            autoFilled.current = null;
            requestId.current = null;
        });

        return () => {
            active = false;
        };
    }, [isOpen, editingOrder, pending]);

    useEffect(() => { draftRef.current = draft; }, [draft]);
    useEffect(() => {
        if (!isOpen) return;
        const element = dialog.current;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        if (!element?.open) element?.show();
        return () => { element?.close(); document.body.style.overflow = previous; };
    }, [isOpen]);
    useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); request.current?.abort(); }, []);
    useEffect(() => {
        if (!isOpen) return;
        const phone = lookupPhone(draft.recipientPhone);
        if (!phone) return;
        if (
            editingOrder &&
            phone === lookupPhone(editingOrder.recipientPhone)
        ) {
            return;
        }
        const controller = new AbortController(); let active = true;
        const timer = setTimeout(async () => {
            const before = draftRef.current;
            setCustomerBusy(true); setCustomerInfo("");
            try {
                const response = await fetch(`/api/orders/customer?${new URLSearchParams({ phone })}`, { cache: "no-store", signal: controller.signal });
                const data = await response.json() as { success?: boolean; message?: string; customer?: { firstName: string; lastName: string; address: string } | null };
                if (!response.ok || !data.success) throw new Error(data.message || "კლიენტის მოძებნა ვერ მოხერხდა.");
                if (!active) return;
                if (data.customer) {
                    const customer = data.customer;
                    setDraft(current => lookupPhone(current.recipientPhone) === phone ? {
                        ...current,
                        recipientFirstName: current.recipientFirstName === before.recipientFirstName ? customer.firstName : current.recipientFirstName,
                        recipientLastName: current.recipientLastName === before.recipientLastName ? customer.lastName : current.recipientLastName,
                        shippingAddress: current.shippingAddress === before.shippingAddress ? customer.address : current.shippingAddress,
                    } : current);
                    autoFilled.current = { ...customer, phone };
                    setCustomerInfo("კლიენტი მოიძებნა.");
                } else setCustomerInfo("ახალი კლიენტი — შეკვეთასთან ერთად შეინახება.");
            } catch (cause: unknown) {
                if (active && !(cause instanceof Error && cause.name === "AbortError")) setCustomerInfo(cause instanceof Error ? cause.message : "კლიენტის მოძებნა ვერ მოხერხდა. ინფორმაციის ხელით შეყვანა შეგიძლია.");
            } finally { if (active) setCustomerBusy(false); }
        }, 350);
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [
        isOpen,
        draft.recipientPhone,
        lookupRevision,
        editingOrder,
    ]);

    function patch(values: Partial<OrderFormDraft>) { setDraft(current => ({ ...current, ...values })); setDirty(true); setError(""); }
    function changePhone(phone: string) {
        const previous = autoFilled.current;
        setDraft(current => ({
            ...current, recipientPhone: phone,
            ...(previous && lookupPhone(phone) !== previous.phone ? {
                recipientFirstName: current.recipientFirstName === previous.firstName ? "" : current.recipientFirstName,
                recipientLastName: current.recipientLastName === previous.lastName ? "" : current.recipientLastName,
                shippingAddress: current.shippingAddress === previous.address ? "" : current.shippingAddress,
            } : {}),
        }));
        if (previous && lookupPhone(phone) !== previous.phone) autoFilled.current = null;
        setDirty(true); setCustomerInfo(""); setCustomerBusy(Boolean(lookupPhone(phone))); setError("");
    }
    function reset() {
        productNumber.current = 0;
        setDraft(emptyOrderDraft()); setPaidMode("none"); setDirty(false); setPending(null); setError("");
        setPickerOpen(false); setCustomerInfo(""); setCustomerBusy(false); autoFilled.current = null; requestId.current = null;
    }
    function canLeave() {
        if (photosUploading) {
            window.alert(
                "ფოტო ჯერ იტვირთება. დაელოდე დასრულებას ან პროდუქტის ფოტოსთან დააჭირე „ატვირთვის შეწყვეტა“-ს.",
            );
            return false;
        }
        if (saving) { window.alert("მიმდინარეობს შენახვა. შეგიძლია შეწყვიტო ლოდინი ქვედა ღილაკით და შემდეგ ხელახლა სცადო."); return false; }
        if (pending) return window.confirm("შენახვის შედეგი ჯერ დაუდასტურებელია. ფანჯარაში დაბრუნებისას იგივე მოთხოვნას ხელახლა სცდი. გვერდის განახლებამდე შეინახე მონახაზის ასლი. დახურო ფანჯარა?");
        return !dirty || window.confirm("ცვლილებები შენახული არ არის. დახურო ფანჯარა და დაკარგო შეყვანილი მონაცემები?");
    }
    function leave() {
        if (closeTimer.current) return;
        setPickerOpen(false); setClosing(true);
        closeTimer.current = setTimeout(() => {
            if (!pending) reset();
            closeNewOrder(); setClosing(false); closeTimer.current = null;
        }, 260);
    }
    useOrderLeaveGuard({ open: isOpen, dirty: dirty || Boolean(pending), canLeave, leave });
    function requestClose() { if (canLeave()) leave(); }
    function addManual() {
        const item = {
            ...manualOrderItem(),
            displayNumber: ++productNumber.current,
        };

        setDraft(current => ({
            ...current,
            items: [item, ...current.items],
        }));

        setDirty(true);
        setError("");

        requestAnimationFrame(() => {
            productList.current?.firstElementChild?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        });
    }
    function chooseInventory(
        product: InventoryOrderProduct,
        condition: "GOOD" | "DEFECTIVE",
    ) {
        const alreadyExists = draft.items.some(
            item =>
                !item.isCarriedOver &&
                item.inventoryItemId === product.id &&
                item.condition === condition,
        );

        const newItem = {
            ...inventoryOrderItem(product, condition),
            displayNumber: alreadyExists
                ? undefined
                : ++productNumber.current,
        };

        setDraft(current => {
            const existing = current.items.find(
                item =>
                    !item.isCarriedOver &&
                    item.inventoryItemId === product.id &&
                    item.condition === condition,
            );

            if (!existing) {
                return {
                    ...current,
                    items: [newItem, ...current.items],
                };
            }

            const updated = {
                ...existing,
                quantity: String(
                    (Number(existing.quantity) || 0) + 1,
                ),
            };

            return {
                ...current,
                items: [
                    updated,
                    ...current.items.filter(
                        item => item.key !== existing.key,
                    ),
                ],
            };
        });

        setDirty(true);
        setError("");
        setPickerOpen(false);

        requestAnimationFrame(() => {
            productList.current?.firstElementChild?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        });
    }
    function updateItem(
        key: string,
        values: Partial<OrderFormItem>,
    ) {
        setDraft(current => ({
            ...current,
            items: current.items.map(item =>
                item.key === key
                    ? { ...item, ...values }
                    : item,
            ),
        }));

        setDirty(true);
        setError("");
    }
    function exportDraft() {
        const blob = new Blob([JSON.stringify({ draft, paidMode, pendingRequest: pending, clientRequestId: requestId.current }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "marteo-order-draft.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function submit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();
        if (removingProduct) return;

        if (photosUploading) {
            setError("ფოტო ჯერ იტვირთება. დაელოდე დასრულებას.");
            return;
        }

        if (requestBusy.current) return;

        let operation: PendingOrderSave;

        try {
            requestId.current ??= crypto.randomUUID();

            if (pending) {
                operation = pending;
            } else if (editingOrder) {
                const paidBefore = moneyCents(editingOrder.paidAmount);
                const paidNow = moneyCents(draft.paidAmount);

                if (paidBefore === null || paidNow === null) {
                    throw new Error("მიუთითე სწორი გადახდილი თანხა.");
                }

                if (paidNow < paidBefore) {
                    throw new Error(
                        "გადახდილი თანხის შესამცირებლად გამოიყენე თანხის დაბრუნების დადასტურება შეკვეთის დეტალებიდან.",
                    );
                }

                const additionalPayment = paidNow - paidBefore;

                if (additionalPayment > 0n) {
                    if (paidNow > totals.total) {
                        throw new Error(
                            "ახალი გადახდა დარჩენილ გადასახდელ თანხას აღემატება.",
                        );
                    }

                    if (!window.confirm(
                        `დაადასტურე, რომ კლიენტისგან დამატებით მიიღე ${moneyText(additionalPayment)} ₾. ეს თანხა გადახდების ისტორიაში ჩაიწერება.`,
                    )) {
                        return;
                    }
                }

                operation = {
                    kind: "edit",
                    orderId: editingOrder.id,
                    payload: orderEditPayload(
                        draft,
                        requestId.current,
                        editingOrder.expectedVersion,
                    ),
                };
            } else {
                operation = {
                    kind: "create",
                    payload: orderCreatePayload(
                        draft,
                        paidMode,
                        requestId.current,
                    ),
                };
            }
        } catch (cause: unknown) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე მონაცემები.",
            );
            return;
        }

        requestBusy.current = true;
        setSaving(true);
        setPending(operation);
        setError("");

        const controller = new AbortController();
        request.current = controller;

        try {
            let savedOrder: {
                id: string;
                number: number | null;
            };

            if (operation.kind === "edit") {
                savedOrder = await sendOrderAction(
                    operation.orderId,
                    "edit",
                    operation.payload,
                    controller.signal,
                );
            } else {
                const response = await fetch("/api/orders", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(operation.payload),
                    signal: controller.signal,
                });

                const result = await response.json() as {
                    success?: boolean;
                    message?: string;
                    order?: {
                        id: string;
                        number: number | null;
                    };
                };

                if (
                    !response.ok ||
                    !result.success ||
                    !result.order
                ) {
                    throw new SaveError(
                        result.message ||
                        "შენახვის შედეგი ვერ დადასტურდა.",
                        response.status,
                    );
                }

                savedOrder = result.order;
            }

            setSaved(savedOrder);
            reset();
            setClosing(true);

            closeTimer.current = setTimeout(() => {
                closeNewOrder();
                setClosing(false);
                closeTimer.current = null;
                startTransition(() => router.refresh());
            }, 260);
        } catch (cause: unknown) {
            const rejected =
                (
                    cause instanceof SaveError ||
                    cause instanceof OrderActionError
                ) &&
                cause.status >= 400 &&
                cause.status < 500;

            if (rejected) {
                setPending(null);
                requestId.current = null;
                setError(cause.message);
            } else {
                setError(
                    "შენახვის შედეგი ვერ დადასტურდა. მონაცემები შენარჩუნებულია — დააჭირე ხელახლა ცდას.",
                );
            }
        } finally {
            requestBusy.current = false;
            request.current = null;
            setSaving(false);
        }
    }

    return <>
        {saved && !isOpen && <div role="status" className="fixed bottom-5 right-4 z-50 flex max-w-[calc(100%_-_2rem)] items-center gap-3 rounded-2xl border border-success/30 bg-surface p-3 text-sm text-text-primary shadow-xl"><Icon icon="solar:check-circle-linear" className="h-6 w-6 shrink-0 text-success" /><span>შეკვეთა {saved.number !== null ? `#${String(saved.number).padStart(4, "0")}` : ""} შენახულია.</span><OrderInvoiceButton orderId={saved.id} /><button type="button" onClick={() => setSaved(null)} aria-label="შეტყობინების დახურვა" className="p-2"><Icon icon="solar:close-circle-linear" className="h-5 w-5" /></button></div>}
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); requestClose(); }} aria-labelledby={headingId} data-closing={closing} onKeyDown={event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                requestClose();
            }
        }} className="order-create-dialog fixed bottom-0 left-0 right-0 top-16 z-30 m-0 h-[calc(100dvh-4rem)] max-h-none w-auto max-w-none overflow-hidden border-0 bg-background p-0 text-text-primary lg:left-[280px]">
            <style>{`
                .order-create-dialog[open] { display:flex; flex-direction:column; animation:orderDrawerEnter .3s cubic-bezier(.2,.8,.2,1); }
                .order-create-dialog[data-closing="true"] { animation:orderDrawerExit .26s ease-in forwards; pointer-events:none; }
                @keyframes orderDrawerEnter { from { transform:translateY(100%); opacity:.8; } to { transform:translateY(0); opacity:1; } }
                @keyframes orderDrawerExit { to { transform:translateY(100%); opacity:.8; } }
                @media (prefers-reduced-motion:reduce) { .order-create-dialog[open], .order-create-dialog[data-closing="true"] { animation:none; } }
            `}</style>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
                <button type="button" onClick={requestClose} disabled={saving} aria-label="დახურვა" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border disabled:opacity-40"><Icon icon="solar:close-circle-linear" className="h-6 w-6" /></button>
                <h2
                    id={headingId}
                    className="flex items-center gap-2 text-lg font-semibold sm:text-xl"
                >
                    <Icon
                        icon={
                            editingOrder
                                ? "solar:pen-new-square-linear"
                                : "solar:clipboard-add-linear"
                        }
                        className="h-6 w-6 text-success"
                    />

                    {editingOrder
                        ? "შეკვეთის რედაქტირება"
                        : "ახალი შეკვეთა"}
                </h2>
            </header>
            <form id={formId} onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:flex lg:flex-col lg:overflow-hidden lg:p-4 xl:p-5">
                <fieldset disabled={blocked} className="min-h-0 min-w-0 space-y-3 lg:flex lg:h-full lg:flex-col lg:space-y-0 lg:gap-3 disabled:opacity-70">
                    <section className="shrink-0 rounded-2xl border border-border bg-surface p-3 sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2"><Icon icon="solar:user-linear" className="h-5 w-5 text-accent" /><h3 className="text-sm font-semibold">კლიენტის ინფორმაცია</h3>{customerBusy && <Icon icon="solar:refresh-linear" className="h-4 w-4 animate-spin text-accent" />}<span role="status" className="text-xs text-text-secondary">{customerInfo}</span>{customerInfo && !customerInfo.startsWith("კლიენტი მოიძებნა") && !customerInfo.startsWith("ახალი კლიენტი") && <button type="button" onClick={() => setLookupRevision(value => value + 1)} className="text-xs text-accent underline">ხელახლა მოძებნა</button>}</div>
                        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
                            <div className="col-span-2 lg:col-span-1"><Field label="ტელეფონი *"><input type="tel" autoComplete="off" value={draft.recipientPhone} onChange={event => changePhone(event.target.value)} required placeholder="მაგ: 599 12 34 56" className={input} /></Field></div>
                            <Field label="სახელი"><input value={draft.recipientFirstName} onChange={event => patch({ recipientFirstName: event.target.value })} className={input} /></Field>
                            <Field label="გვარი"><input value={draft.recipientLastName} onChange={event => patch({ recipientLastName: event.target.value })} className={input} /></Field>
                            <div className="col-span-2 lg:col-span-1"><Field label="მისამართი"><input value={draft.shippingAddress} onChange={event => patch({ shippingAddress: event.target.value })} placeholder="ქალაქი, ქუჩა, ნომერი" className={input} /></Field></div>
                        </div>
                    </section>
                    <div className="min-h-0 min-w-0 space-y-3 lg:grid lg:flex-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-4 lg:space-y-0">
                        <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-surface">
                            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />პროდუქტები <span className="font-normal text-text-secondary">{draft.items.length}</span></h3><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPickerOpen(true)} disabled={productsLocked} className="inline-flex h-10 items-center gap-2 rounded-xl border border-success/40 px-3 text-xs font-semibold text-success"><Icon icon="solar:box-linear" className="h-4 w-4" />მარაგიდან არჩევა</button><button type="button" onClick={addManual} disabled={productsLocked} className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-3 text-xs font-semibold text-white"><Icon icon="solar:add-circle-linear" className="h-4 w-4" />ხელით დამატება</button></div></div>
                            <div
                                ref={productList}
                                className="min-h-0 space-y-3 p-3 sm:p-4 lg:flex-1 lg:overflow-y-auto"
                            >
                                {draft.items.length ? (
                                    draft.items.map((item, index) => (
                                        <OrderProductEditor
                                            key={item.key}
                                            item={item}
                                            index={index}
                                            onRemovingChange={setRemovingProduct}
                                            readOnly={
                                                productsLocked ||
                                                Boolean(editingOrder && item.isCarriedOver)
                                            }
                                            update={values => updateItem(item.key, values)}
                                            remove={() => {
                                                setDraft(current => ({
                                                    ...current,
                                                    items: current.items.filter(
                                                        value => value.key !== item.key,
                                                    ),
                                                }));

                                                setDirty(true);
                                                setError("");
                                            }}
                                        />
                                    ))
                                ) : (
                                    <div className="flex min-h-40 flex-col items-center justify-center gap-3 py-10 text-center text-text-secondary lg:h-full">
                                        <Icon
                                            icon="solar:box-linear"
                                            className="h-10 w-10 text-accent/60"
                                        />
                                        <p className="text-sm">
                                            აირჩიე მარაგიდან ან დაამატე ხელით
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>
                        <aside className="min-h-0 min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4 lg:overflow-y-auto">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon icon="solar:wallet-money-linear" className="h-5 w-5 text-success" />გადახდა</h3>
                            {editingOrder && (
                                <div className="mb-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
                                    <p className="text-xs font-medium">
                                        უკვე მიღებულია: {editingOrder.paidAmount} ₾
                                    </p>

                                    <p className="mt-1 text-xs text-text-secondary">
                                        დამატებითი გადახდის მიღებისას მიუთითე ჯამურად
                                        მიღებული თანხა. პროდუქტის ფასის ცვლილება
                                        გადახდილ თანხას ავტომატურად არ ცვლის.
                                    </p>

                                    {totals.remaining < 0n && (
                                        <p className="mt-2 text-xs text-warning">
                                            დასაბრუნებელია {moneyText(-totals.remaining)} ₾.
                                            რეალური დაბრუნება დაადასტურე შეკვეთის
                                            დეტალებიდან, თანხის დაბრუნების ღილაკით.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="space-y-3">
                                <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2"><Field label="კურიერის საფასური · ₾"><input inputMode="decimal" value={draft.courierFee} readOnly={productsLocked} onChange={event => patch({ courierFee: event.target.value })} className={input} /></Field><Field label="გადახდა"><select disabled={Boolean(editingOrder)} value={paidMode} onChange={event => { setPaidMode(event.target.value as PaidMode); setDirty(true); }} className={input}><option value="none">გადახდა არ არის</option><option value="full">სრულად გადახდილი</option><option value="courier">მხოლოდ კურიერი</option><option value="custom">
                                    {editingOrder
                                        ? "მიღებული თანხის მითითება"
                                        : "ნაწილობრივ"}
                                </option></select></Field></div>
                                {paidMode !== "none" && <><Field label="გადახდილი თანხა · ₾"><input inputMode="decimal" readOnly={paidMode !== "custom"} value={paidMode === "custom" ? draft.paidAmount : moneyText(totals.paid)} onChange={event => patch({ paidAmount: event.target.value })} className={input} /></Field><Field label="გადახდის მეთოდი"><select value={draft.paymentMethod} onChange={event => patch({ paymentMethod: event.target.value as OrderFormDraft["paymentMethod"] })} className={input}><option value="CASH">ნაღდი</option><option value="BANK_TRANSFER">გადარიცხვა</option><option value="CARD">ბარათი</option></select></Field>{draft.paymentMethod === "BANK_TRANSFER" && <Field label="ბანკი"><input value={draft.bankName} onChange={event => patch({ bankName: event.target.value })} className={input} /></Field>}</>}
                            </div>
                            <div className="mt-4 rounded-xl bg-background p-3"><h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary"><Icon icon="solar:document-text-linear" className="h-4 w-4" />შეჯამება</h4><dl className="space-y-2 text-xs lg:text-sm">{[["პროდუქტები", totals.products], ["კურიერი", totals.courier], ["გადახდილი", totals.paid], [
                                totals.remaining < 0n
                                    ? "დასაბრუნებელი"
                                    : "დარჩენილი",
                                totals.remaining < 0n
                                    ? -totals.remaining
                                    : totals.remaining,
                            ]].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-2"><dt className="text-text-secondary">{String(label)}</dt><dd className="break-all font-medium tabular-nums">{moneyText(amount as bigint)} ₾</dd></div>)}<div className="flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold"><dt>სულ</dt><dd className="break-all tabular-nums text-success">{moneyText(totals.total)} ₾</dd></div></dl></div>
                        </aside>
                    </div>
                </fieldset>
            </form>
            <footer className="shrink-0 border-t border-border bg-surface px-3 py-3 sm:px-5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                {error && <p role="alert" className="mb-2 text-xs text-danger sm:text-sm">{error}</p>}
                {pending && !saving && <p className="mb-2 text-xs text-text-secondary">იგივე მონაცემები ხელახლა გაიგზავნება. ასლის შენახვაც შეგიძლია.</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><button type="button" onClick={requestClose} disabled={saving} className="h-11 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-40">გაუქმება</button>{(pending || saving) && <button type="button" onClick={exportDraft} title="მონახაზის ასლის შენახვა" aria-label="მონახაზის ასლის შენახვა" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-accent"><Icon icon="solar:download-linear" className="h-5 w-5" /></button>}</div>
                    <div className="flex items-center gap-2">{saving && <button type="button" onClick={() => request.current?.abort()} className="h-11 px-2 text-xs text-text-secondary underline">შეაჩერე ლოდინი</button>}<button type="submit" form={formId} disabled={
                        saving ||
                        removingProduct ||
                        photosUploading ||
                        (customerBusy && !pending)
                    } className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white hover:bg-success-hover disabled:opacity-60"><Icon icon={saving ? "solar:refresh-linear" : "solar:check-circle-linear"} className={`h-5 w-5 ${saving ? "animate-spin" : ""}`} />{saving
                        ? "ინახება…"
                        : photosUploading
                            ? "ფოტო იტვირთება…"
                            : pending
                                ? "ხელახლა ცდა"
                                : "შეკვეთის შენახვა"}</button></div>
                </div>
            </footer>
        </dialog>
        {isOpen && pickerOpen && <OrderInventoryPicker items={draft.items} close={() => setPickerOpen(false)} choose={chooseInventory} />}
    </>;
}
