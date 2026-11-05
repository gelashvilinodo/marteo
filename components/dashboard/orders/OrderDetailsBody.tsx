"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";
import MissingCostsButton from "@/components/dashboard/costs/MissingCostsButton";
import type { OrderEntry, OrderDetailEntry } from "@/lib/orders/get-orders-page";
import { quantityLabel } from "@/lib/orders/quantity";
import { deliveryZoneLabel, moneyCents } from "@/lib/orders/order-form";
import { OrderActionError, sendOrderAction } from "@/lib/orders/order-actions-client";
import OrderEditButton from "./OrderEditButton";
import OrderInvoiceButton from "./OrderInvoiceButton";

// ეს მოქმედებები მხოლოდ დეტალების გახსნის შემდეგ ჩანს.
const OrderDeleteButton = dynamic(() => import("./OrderDeleteButton"), { ssr: false });
const OrderRefundButton = dynamic(() => import("./OrderRefundButton"), { ssr: false });
const OrderPaymentResolution = dynamic(() => import("./OrderPaymentResolution"), { ssr: false });

export { statuses, payments, number, recipient, date } from "./order-labels";
import { statuses, payments, methods, number, recipient, date } from "./order-labels";

export function Status({
    order,
    onReturn,
    onChanged,
}: {
    order: OrderEntry;
    onReturn: (orderId: string) => void;
    onChanged: (orderId: string) => Promise<void>;
}) {
    const [refreshing, startRefresh] = useTransition();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [current, setCurrent] = useState({
        status: order.status,
        version: order.invoiceVersion,
    });

    const retry = useRef<Record<string, unknown> | null>(null);
    const running = useRef(false);

    const completionDialog = useRef<HTMLDialogElement>(null);
    const [fullPaymentReceived, setFullPaymentReceived] = useState(false);
    const [completionMethod, setCompletionMethod] = useState<
        "CASH" | "BANK_TRANSFER" | "CARD"
    >("CASH");
    const [completionBankName, setCompletionBankName] = useState("");

    const [completionCosts, setCompletionCosts] = useState<
        Record<string, string>
    >({});

    const costsReady = order.missingManualCosts.every(
        item => moneyCents(completionCosts[item.id] ?? "") !== null,
    );

    const needsPayment = Number(order.remainingAmount) > 0;

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
            if (payload.status === "COMPLETED") {
                completionDialog.current?.close();
            }
            setCurrent({
                status: payload.status as OrderEntry["status"],
                version: result.version,
            });

            startRefresh(async () => {
                await onChanged(order.id);
            });
        } catch (cause: unknown) {
            const definiteFailure =
                cause instanceof OrderActionError &&
                cause.status < 500;

            retry.current = definiteFailure ? null : payload;

            setError(
                definiteFailure
                    ? cause.message
                    : "შედეგი დაუდასტურებელია. დააჭირეთ ხელახლა ცდას.",
            );

            if (
                cause instanceof OrderActionError &&
                cause.status === 409
            ) {
                startRefresh(async () => {
                    await onChanged(order.id);
                });
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

        if (next === "COMPLETED") {
            setCompletionCosts({});
            setFullPaymentReceived(false);
            setCompletionMethod("CASH");
            setCompletionBankName("");
            setError("");
            completionDialog.current?.showModal();
            return;
        }

        let stockReturned = false;

        if (next === "CANCELED") {
            if (!window.confirm("გააუქმოთ შეკვეთა?")) return;

            if (current.status === "SHIPPED") {
                stockReturned = window.confirm(
                    "პროდუქტები ფიზიკურად დაბრუნდა? OK - დაბრუნდა და მარაგს დაემატოს; Cancel - ჯერ არ დაბრუნებულა.",
                );
            }
        }

        void save({
            requestId: crypto.randomUUID(),
            expectedVersion: current.version,
            status: next,
            confirmCompleted: false,
            stockReturned,
        });
    }

    return (
        <div className="@container min-w-0 w-full">
            <div
                title={status.label}
                className={`relative inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1.5 ${status.tone}`}
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

                <span className="hidden min-w-0 truncate text-xs font-medium @[11rem]:inline">
                    {status.label}
                </span>

                <span className="sr-only @[11rem]:hidden">
                    {status.label}
                </span>

                {(availableStatuses.length > 0 || canManageReturn) && (
                    <>
                        <Icon
                            icon="solar:alt-arrow-down-linear"
                            className="h-3.5 w-3.5 shrink-0"
                        />

                        <select
                            aria-label={`შეკვეთა ${number(order)} - სტატუსის შეცვლა`}
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

            <dialog
                ref={completionDialog}
                aria-label="შეკვეთის დასრულება"
                onCancel={event => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (!busy && !retry.current) {
                        completionDialog.current?.close();
                    }
                }}
                onClose={event => event.stopPropagation()}
                className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm"
            >
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Icon
                        icon="solar:check-circle-linear"
                        className="h-6 w-6 text-success"
                    />
                    შეკვეთის დასრულება
                </h3>

                <p className="mt-3 text-sm text-text-secondary">
                    დასრულების შემდეგ შეკვეთის რედაქტირება აღარ იქნება
                    შესაძლებელი. დასრულებულ შეკვეთაზე დაბრუნებასა და
                    გადაცვლას შესაბამისი მოქმედებებით შეძლებთ.
                </p>

                {order.missingManualCosts.length > 0 && (
                    <fieldset
                        disabled={busy || Boolean(retry.current)}
                        className="mt-4 space-y-3 rounded-xl border border-border bg-background p-3 disabled:opacity-60"
                    >
                        <legend className="px-1 text-sm font-semibold">
                            პროდუქტების თვითღირებულება
                        </legend>

                        <p className="text-xs leading-relaxed text-text-secondary">
                            ამ პროდუქტებზე ხარჯი ჯერ არ არის მითითებული.
                            დასრულებისთვის შეიყვანეთ, რა დაგიჯდათ ერთი ნივთი.
                            თუ ხარჯი ნამდვილად არ გქონიათ, ჩაწერეთ 0.
                        </p>

                        {order.missingManualCosts.map(item => (
                            <label
                                key={item.id}
                                className="block space-y-2"
                            >
                                <span className="flex items-center gap-2 text-sm">
                                    {item.imageUrl ? (
                                        <Image
                                            src={item.imageUrl}
                                            alt=""
                                            width={36}
                                            height={36}
                                            className="h-9 w-9 shrink-0 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                                            <Icon
                                                icon="solar:box-linear"
                                                className="h-5 w-5 text-accent"
                                            />
                                        </span>
                                    )}

                                    <span className="min-w-0 break-words">
                                        {item.name}
                                    </span>
                                </span>

                                <span className="block text-xs text-text-secondary">
                                    ერთი ერთეულის თვითღირებულება · ₾
                                </span>

                                <input
                                    inputMode="decimal"
                                    value={completionCosts[item.id] ?? ""}
                                    onChange={event => {
                                        const value = event.target.value;

                                        setCompletionCosts(current => ({
                                            ...current,
                                            [item.id]: value,
                                        }));

                                        setError("");
                                    }}
                                    placeholder="მაგალითად: 12.50"
                                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-[16px] text-text-primary outline-none focus:border-accent"
                                />
                            </label>
                        ))}
                    </fieldset>
                )}

                {needsPayment && (
                    <fieldset
                        disabled={busy || Boolean(retry.current)}
                        className="mt-4 space-y-3 disabled:opacity-60"
                    >
                        <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
                            დარჩენილია {order.remainingAmount} ₾.
                            შეკვეთა მხოლოდ ამ თანხის რეალურად მიღების
                            დადასტურების შემდეგ დასრულდება.
                        </p>

                        <label className="flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={fullPaymentReceived}
                                onChange={event =>
                                    setFullPaymentReceived(event.target.checked)
                                }
                                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                            />
                            დარჩენილი {order.remainingAmount} ₾ რეალურად მივიღე
                        </label>

                        <label className="block text-sm">
                            <span className="mb-1 block text-text-secondary">
                                დარჩენილი თანხის გადახდის მეთოდი
                            </span>
                            <select
                                value={completionMethod}
                                onChange={event =>
                                    setCompletionMethod(
                                        event.target.value as typeof completionMethod,
                                    )
                                }
                                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px]"
                            >
                                <option value="CASH">ნაღდი</option>
                                <option value="BANK_TRANSFER">გადარიცხვა</option>
                                <option value="CARD">ბარათი</option>
                            </select>
                        </label>

                        {completionMethod === "BANK_TRANSFER" && (
                            <label className="block text-sm">
                                <span className="mb-1 block text-text-secondary">
                                    ბანკი - არასავალდებულო
                                </span>
                                <input
                                    value={completionBankName}
                                    onChange={event =>
                                        setCompletionBankName(event.target.value)
                                    }
                                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px]"
                                />
                            </label>
                        )}
                    </fieldset>
                )}

                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                {retry.current && (
                    <p className="mt-3 text-xs text-warning">
                        შედეგი დაუდასტურებელია. ხელახლა ცდა იმავე მოთხოვნას
                        გამოიყენებს, რათა გადახდა მეორედ არ დაემატოს.
                    </p>
                )}

                <div className="mt-5 flex flex-wrap justify-between gap-2">
                    <button
                        type="button"
                        disabled={busy || Boolean(retry.current)}
                        onClick={() => completionDialog.current?.close()}
                        className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40"
                    >
                        გაუქმება
                    </button>

                    <button
                        type="button"
                        disabled={
                            busy ||
                            refreshing ||
                            (
                                !retry.current &&
                                (
                                    !costsReady ||
                                    (needsPayment && !fullPaymentReceived)
                                )
                            )
                        }
                        onClick={() => {
                            if (retry.current) {
                                void save(retry.current);
                                return;
                            }

                            void save({
                                requestId: crypto.randomUUID(),
                                expectedVersion: current.version,
                                status: "COMPLETED",
                                confirmCompleted: true,
                                confirmFullPayment: needsPayment && fullPaymentReceived,
                                completionPaymentMethod: completionMethod,
                                completionBankName,
                                completionCosts: order.missingManualCosts.map(item => ({
                                    orderItemId: item.id,
                                    unitCost: (completionCosts[item.id] ?? "")
                                        .trim()
                                        .replace(",", "."),
                                })),
                                stockReturned: false,
                            });
                        }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                        <Icon
                            icon={
                                busy
                                    ? "solar:refresh-linear"
                                    : "solar:check-circle-linear"
                            }
                            className={`h-5 w-5 ${busy ? "animate-spin" : ""}`}
                        />
                        {busy
                            ? "ინახება…"
                            : retry.current
                                ? "ხელახლა ცდა"
                                : "შეკვეთის დასრულება"}
                    </button>
                </div>
            </dialog>

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


// შეკვეთის დეტალების შიგთავსი — იგივე შეკვეთების გვერდზე და მართეო AI-ში.
export function OrderDetailsBody({
    order,
    onClose,
    onChanged,
    onReturn,
    onReadyToDelete,
}: {
    order: OrderDetailEntry;
    onClose: () => void;
    onChanged: (orderId: string) => Promise<void>;
    onReturn: (orderId: string) => void;
    onReadyToDelete: (orderId: string) => void;
}) {
    return (
        <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
                <h2
                    id="order-details-title"
                    className="min-w-0 text-lg font-semibold"
                >
                    შეკვეთა {number(order)}
                </h2>

                <div className="flex shrink-0 items-center gap-2">
                    <OrderInvoiceButton orderId={order.id} />
                    {order.status !== "COMPLETED" &&
                        order.status !== "RETURNED" &&
                        !order.hasReturnHistory && (
                            <OrderEditButton
                                key={order.id}
                                orderId={order.id}
                                onOpened={onClose}
                            />
                        )}

                    <OrderDeleteButton
                        key={`delete-${order.id}`}
                        orderId={order.id}
                        onDeleted={onClose}
                        onReadyToDelete={onReadyToDelete}
                    />

                    <button
                        type="button"
                        onClick={onClose}
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
            <div className="mt-4"><MissingCostsButton orderId={order.id} /></div>
            <div className="mt-4 flex items-center justify-between gap-2"><Status
                onChanged={onChanged}
                order={order}
                onReturn={onReturn}
            /><span className="text-sm text-text-secondary">{payments[order.paymentStatus]}</span></div>
            {order.paymentStatus === "UNKNOWN" &&
                (
                    order.status === "PROCESSING" ||
                    order.status === "SHIPPED"
                ) &&
                !order.hasReturnHistory &&
                !order.hasPastReturns &&
                !order.stockReturnedAt &&
                !order.deleteRequestedAt && (
                    <OrderPaymentResolution
                        key={`${order.id}:${order.invoiceVersion}`}
                        orderId={order.id}
                        expectedVersion={order.invoiceVersion}
                        onResolved={async () => {
                            await onChanged(order.id);
                        }}
                    />
                )}
            <section
                aria-label="შეკვეთის დამატებითი ინფორმაცია"
                className="mt-4 space-y-2"
            >
                {order.notes && (
                    <div className="rounded-xl border border-border bg-background p-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Icon
                                icon="solar:document-text-linear"
                                className="h-5 w-5 text-accent"
                            />
                            კომენტარი
                        </h3>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">
                            {order.notes}
                        </p>
                    </div>
                )}
                {order.hasPastReturns && (
                    <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-text-secondary">
                        <Icon
                            icon="solar:history-linear"
                            className="h-4 w-4 shrink-0 text-accent"
                        />
                        <span>
                            შეკვეთაზე გადაცვლა შესრულებულია. წინა ნივთების
                            დაბრუნების ისტორია შენახულია - მის სანახავად
                            სტატუსის მენიუში აირჩიეთ „დაბრუნების მართვა“.
                        </span>
                    </p>
                )}
                <p className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs text-text-secondary">
                    <Icon
                        icon="solar:document-text-linear"
                        className="h-4 w-4 shrink-0 text-accent"
                    />
                    <span>
                        {order.printState === "NEW"
                            ? "ინვოისი ჯერ არ დაბეჭდილა."
                            : order.printState === "UPDATED"
                                ? "შეკვეთა შეიცვალა. განახლებული ინვოისი ხელახლა დასაბეჭდია."
                                : "ინვოისის მიმდინარე ვერსია დაბეჭდილია."}
                    </span>
                </p>

                {order.pendingReturnQuantity > 0 && (
                    <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                        <Icon
                            icon="solar:clock-circle-linear"
                            className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <span>
                            ველოდებით {order.pendingReturnQuantity} პროდუქტის
                            ფიზიკურ დაბრუნებას. მარაგი მიღების დადასტურებამდე
                            არ შეიცვლება.
                        </span>
                    </p>
                )}

                {order.receivedReturnQuantity > 0 && (
                    <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-accent">
                        <Icon
                            icon="solar:undo-left-round-linear"
                            className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <span>
                            მიღებულია {order.receivedReturnQuantity} დაბრუნებული
                            პროდუქტი. მარაგიდან გაყიდული ნივთების დაბრუნება
                            უკვე აღრიცხულია.
                        </span>
                    </p>
                )}

                {order.deleteRequestedAt && (
                    <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                        <Icon
                            icon="solar:trash-bin-trash-linear"
                            className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <span>
                            წაშლა მოთხოვნილია.
                            {order.pendingReturnQuantity > 0
                                ? " ჯერ ველოდებით ნივთების დაბრუნებას; მიღების შემდეგ წაშლის დადასტურებას შემოგთავაზებთ."
                                : " დაბრუნების მოლოდინი დასრულებულია. შეკვეთის წაშლა შეგიძლიათ წაშლის ღილაკიდან დაადასტუროთ."}
                        </span>
                    </p>
                )}
            </section>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[['მიმღები', recipient(order)], ['ტელეფონი', order.recipientPhone], ['მიწოდება', order.deliveryZone ? deliveryZoneLabel[order.deliveryZone] : '-'], ['მისამართი', order.shippingAddress || '-'], ['თარიღი', date(order.createdAt)], ...(order.createdByName ? [['გააფორმა', order.createdByName]] : [])].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-text-secondary">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
            </dl>
            <h3 className="mt-5 font-semibold">პროდუქტები</h3>
            <div className="mt-2 space-y-2">
                {order.items.filter(item => item.currentQuantity > 0).map(item => (
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
                                        {item.source==="MATERIAL"?quantityLabel(item.currentQuantity,item.unit):item.currentQuantity} × {item.unitPrice} ₾
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
            {order.payments.length > 0 && <div className="mt-4 border-t border-border pt-3"><h3 className="text-sm font-semibold">გადახდები</h3>{order.payments.map(payment => <p key={payment.id} className="mt-2 text-xs text-text-secondary">{date(payment.createdAt)} · {methods[payment.method]}{payment.bankName ? ` · ${payment.bankName}` : ''} · {payment.amount} ₾</p>)}</div>}
            <dl className="mt-4 space-y-2 text-sm">
                {[
                    ["პროდუქტები", order.productsTotal],
                    ["კურიერის საფასური", order.courierFee],
                    ["სულ", order.total],
                    ...(order.paymentStatus === "UNKNOWN"
                        ? []
                        : [
                            ["გადახდილი", order.paidAmount],
                            ["დარჩენილი გადასახდელი", order.remainingAmount],
                        ]),
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

            {order.paymentStatus !== "UNKNOWN" &&
                order.refundDue !== "0.00" && (
                    <section className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                        <div className="flex items-start gap-3">
                            <Icon
                                icon="solar:wallet-money-linear"
                                className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                            />

                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-warning">
                                    მომხმარებლისთვის დასაბრუნებელია {order.refundDue} ₾
                                </h3>

                                <p className="mt-2 text-xs text-text-secondary">
                                    გადახდილი თანხა შეკვეთის მიმდინარე ჯამს
                                    აღემატება. თანხის დაბრუნება ჯერ არ არის
                                    აღრიცხული.
                                </p>

                                <p className="mt-2 text-xs text-text-secondary">
                                    ჯერ დაუბრუნეთ თანხა მომხმარებელს, შემდეგ
                                    დაადასტურეთ.
                                </p>
                            </div>
                        </div>

                        <div className="mt-3">
                            <OrderRefundButton
                                orderId={order.id}
                                onChanged={() => { void onChanged(order.id); }}
                                onUpdated={onClose}
                            />
                        </div>
                    </section>
                )}
        </div>
    );
}
