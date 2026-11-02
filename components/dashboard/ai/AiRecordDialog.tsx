"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { OrderDetailEntry } from "@/lib/orders/get-orders-page";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";
import type { InventoryProduct } from "@/components/dashboard/inventory/InventoryView";
import { orderCard, type AiOrderCard } from "@/lib/ai/ai-cards";
import { refreshOrdersAfterMutation } from "@/lib/orders/refresh-orders-client";
import { OrderDetailsBody } from "@/components/dashboard/orders/OrderDetailsBody";
import { number } from "@/components/dashboard/orders/order-labels";
import { COURIER_REMINDER_CHANGED } from "@/components/dashboard/orders/CourierReminder";
import InventoryProductDetails from "@/components/dashboard/inventory/InventoryProductDetails";
import CustomerDetails from "@/components/dashboard/customers/CustomerDetails";

const OrderReturnButton = dynamic(() => import("@/components/dashboard/orders/OrderReturnButton"), { ssr: false });
const OrderDeleteButton = dynamic(() => import("@/components/dashboard/orders/OrderDeleteButton"), { ssr: false });
const InventoryEditDialog = dynamic(() => import("@/components/dashboard/inventory/InventoryEditDialog"), { ssr: false });
const InventoryDeleteDialog = dynamic(() => import("@/components/dashboard/inventory/InventoryDeleteDialog"), { ssr: false });
const CustomerForm = dynamic(() => import("@/components/dashboard/customers/CustomerForm"), { ssr: false });

export type AiRecordTarget =
    | { kind: "orders"; item: AiOrderCard }
    | { kind: "stock"; item: InventoryProduct }
    | { kind: "customers"; item: CustomerEntry };

type Props = {
    target: AiRecordTarget;
    onClose: () => void;
    onOrderUpdated: (card: AiOrderCard) => void;
    onRemoved: (id: string) => void;
};

// ფანჯარა იმავე გვერდზე იხსნება, ფონი იბლარება; შიგთავსი იგივეა, რაც
// შეკვეთების, მარაგების და მომხმარებლების გვერდებზე.
export default function AiRecordDialog(props: Props) {
    return createPortal(
        props.target.kind === "orders"
            ? <OrderDialog {...props} card={props.target.item} />
            : props.target.kind === "stock"
                ? <StockDialog {...props} product={props.target.item} />
                : <CustomerDialog {...props} customer={props.target.item} />,
        document.body,
    );
}

function useModal(open: boolean) {
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = dialog.current;
        if (!open || !element) return;

        if (!element.open) element.showModal();
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            if (element.open) element.close();
            document.body.style.overflow = previous;
        };
    }, [open]);

    return dialog;
}

function OrderDialog({ card, onClose, onOrderUpdated, onRemoved }: Props & { card: AiOrderCard }) {
    const router = useRouter();
    const [order, setOrder] = useState<OrderDetailEntry | null>(null);
    const [error, setError] = useState("");
    const [followUp, setFollowUp] = useState<{ kind: "return" | "delete"; orderId: string } | null>(null);
    const request = useRef<AbortController | null>(null);
    const dialog = useModal(followUp === null);
    // დაბრუნების ან წაშლის ფანჯარაზე გადასვლისას დეტალების დახურვა მთლიანად არ ხურავს.
    const switching = useRef(false);

    function follow(kind: "return" | "delete", orderId: string) {
        switching.current = true;
        setFollowUp({ kind, orderId });
    }

    const load = useCallback(() => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;

        return fetch(`/api/orders/${encodeURIComponent(card.id)}/details`, {
            cache: "no-store", credentials: "same-origin", signal: controller.signal,
        })
            .then(async (response) => {
                const body = await response.json().catch(() => null) as { success?: boolean; order?: OrderDetailEntry | null; message?: string } | null;

                if (!response.ok || !body?.success || !body.order?.detailsLoaded || body.order.id !== card.id) {
                    throw new Error(body?.message || "შეკვეთის დეტალები ვერ ჩაიტვირთა.");
                }
                if (controller.signal.aborted) return null;

                setOrder(body.order);
                return body.order;
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : "შეკვეთის დეტალები ვერ ჩაიტვირთა.");
                }
                return null;
            });
    }, [card.id]);

    useEffect(() => {
        void load();
        return () => request.current?.abort();
    }, [load]);

    // ცვლილების შემდეგ ბარათიც ახლდება და ღია გვერდებიც.
    async function changed() {
        window.dispatchEvent(new Event(COURIER_REMINDER_CHANGED));
        refreshOrdersAfterMutation(() => router.refresh());
        const next = await load();
        if (next) onOrderUpdated(orderCard(next));
    }

    function removed() {
        refreshOrdersAfterMutation(() => router.refresh());
        onRemoved(card.id);
        onClose();
    }

    if (followUp?.kind === "return") {
        return (
            <OrderReturnButton
                orderId={followUp.orderId}
                autoOpen
                onUpdated={() => void changed()}
                onDismiss={() => { switching.current = false; setFollowUp(null); }}
                onDeleted={removed}
                onReadyToDelete={(orderId) => follow("delete", orderId)}
            />
        );
    }

    if (followUp?.kind === "delete") {
        return (
            <OrderDeleteButton
                orderId={followUp.orderId}
                autoOpen
                onDismiss={() => { switching.current = false; setFollowUp(null); }}
                onDeleted={removed}
                onReadyToDelete={(orderId) => follow("delete", orderId)}
            />
        );
    }

    return (
        <dialog
            ref={dialog}
            onClose={(event) => { if (!event.currentTarget.open && !switching.current) onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            aria-labelledby="order-details-title"
            className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/25 backdrop:backdrop-blur-sm"
        >
            {order ? (
                <OrderDetailsBody
                    order={order}
                    onClose={onClose}
                    onChanged={changed}
                    onReturn={(orderId) => follow("return", orderId)}
                    onReadyToDelete={(orderId) => follow("delete", orderId)}
                />
            ) : (
                <div className="p-4 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="order-details-title" className="text-lg font-semibold">შეკვეთა {number(card)}</h2>
                        <button type="button" onClick={onClose} aria-label="დახურვა" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border">
                            <Icon icon="solar:close-circle-linear" className="h-6 w-6" />
                        </button>
                    </div>
                    {error ? (
                        <div role="alert" className="mt-4 text-sm text-danger">
                            {error}
                            <button type="button" onClick={() => { setError(""); void load(); }} className="ml-3 text-accent underline">ხელახლა ცდა</button>
                        </div>
                    ) : (
                        <div role="status" aria-label="შეკვეთის დეტალები იტვირთება" className="mt-5 animate-pulse space-y-4">
                            <div className="h-12 rounded-xl bg-background" />
                            <div className="h-24 rounded-xl bg-background" />
                            <div className="h-32 rounded-xl bg-background" />
                        </div>
                    )}
                </div>
            )}
        </dialog>
    );
}

function StockDialog({ product, onClose, onRemoved }: Props & { product: InventoryProduct }) {
    const router = useRouter();
    const [action, setAction] = useState<"edit" | "delete" | null>(null);
    const switching = useRef(false);

    function start(next: "edit" | "delete") {
        switching.current = true;
        setAction(next);
    }

    if (action === "edit") {
        return (
            <InventoryEditDialog
                inventoryItemId={product.id}
                onClose={onClose}
                onSaved={() => {
                    router.refresh();
                    onClose();
                }}
            />
        );
    }

    if (action === "delete") {
        return (
            <InventoryDeleteDialog
                inventoryItemId={product.id}
                onClose={onClose}
                onDeleted={() => {
                    router.refresh();
                    onRemoved(product.id);
                    onClose();
                }}
            />
        );
    }

    return (
        <InventoryProductDetails
            product={product}
            onClose={() => { if (!switching.current) onClose(); }}
            onEdit={() => start("edit")}
            onDelete={() => start("delete")}
        />
    );
}

function CustomerDialog({ customer, onClose, onRemoved }: Props & { customer: CustomerEntry }) {
    const [editing, setEditing] = useState(false);
    const dialog = useModal(!editing);
    const switching = useRef(false);

    if (editing) {
        return <CustomerForm customer={customer} onClose={onClose} onSuccess={() => undefined} />;
    }

    return (
        <dialog
            ref={dialog}
            onClose={(event) => { if (!event.currentTarget.open && !switching.current) onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            aria-label="მომხმარებლის დეტალები"
            className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
            <CustomerDetails
                customer={customer}
                onClose={onClose}
                onEdit={() => {
                    switching.current = true;
                    setEditing(true);
                }}
                onSuccess={() => onRemoved(customer.id)}
            />
        </dialog>
    );
}
