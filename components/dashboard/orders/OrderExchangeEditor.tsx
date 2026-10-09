"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import {
    emptyOrderDraft,
    inventoryOrderItem,
    manualOrderItem,
    moneyCents,
    moneyText,
    orderCreatePayload,
    type InventoryOrderProduct,
    type OrderFormItem,
} from "@/lib/orders/order-form";
import OrderInventoryPicker from "./OrderInventoryPicker";
import OrderProductEditor from "./OrderProductEditor";

type Order = Awaited<ReturnType<typeof getOrder>>;
type Products = ReturnType<typeof orderCreatePayload>["items"];

export default function OrderExchangeEditor({
    order,
    blocked,
    onStart,
    onCancel,
    onDirty,
    onUploading,
    onSubmit,
}: {
    order: Order;
    blocked: boolean;
    onStart: () => boolean;
    onCancel: () => boolean;
    onDirty: () => void;
    onUploading: (busy: boolean) => void;
    onSubmit: (items: Products) => void;
}) {
    const [open, setOpen] = useState(false);
    const [picker, setPicker] = useState(false);
    const [items, setItems] = useState<OrderFormItem[]>([]);
    const [error, setError] = useState("");
    const uploading = items.some(item => item.uploadPending);
    useEffect(() => {
        onUploading(uploading);
    }, [uploading, onUploading]);
    const kept = order.items
        .map(item => ({ ...item, quantity: item.quantity - item.receivedReturnQuantity }))
        .filter(item => item.quantity > 0);
    const returned = order.items.filter(item => item.receivedReturnQuantity > 0);
    const oldReturnedTotal = returned.reduce(
        (sum, item) => sum + (moneyCents(item.unitPrice) ?? 0n) * BigInt(item.receivedReturnQuantity), 0n,
    );
    const keptTotal = kept.reduce(
        (sum, item) => sum + (moneyCents(item.unitPrice) ?? 0n) * BigInt(item.quantity), 0n,
    );
    const newTotal = items.reduce((sum, item) => {
        const price = moneyCents(item.unitPrice);
        return price !== null && /^\d+$/.test(item.quantity)
            ? sum + price * BigInt(item.quantity)
            : sum;
    }, 0n);
    const total = keptTotal + newTotal + (moneyCents(order.courierFee) ?? 0n);
    const paid = moneyCents(order.paidAmount) ?? 0n;
    const balance = total - paid;

    function change(key: string, values: Partial<OrderFormItem>) {
        setItems(current => current.map(item => item.key === key ? { ...item, ...values } : item));
        onDirty();
        setError("");
    }
    function choose(product: InventoryOrderProduct, condition: "GOOD" | "DEFECTIVE") {
        setItems(current => {
            const existing = current.find(item => item.inventoryItemId === product.id && item.condition === condition);
            return existing
                ? current.map(item => item.key === existing.key ? { ...item, quantity: String((Number(item.quantity) || 0) + 1) } : item)
                : [...current, inventoryOrderItem(product, condition)];
        });
        onDirty();
        setPicker(false);
    }
    function submit() {
        if (blocked || uploading) return;
        try {
            const payload = orderCreatePayload({
                ...emptyOrderDraft(),
                recipientPhone: order.recipientPhone,
                items,
            }, "none", crypto.randomUUID());
            onSubmit(payload.items);
        } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : "გადაამოწმე ახალი ნივთები.");
        }
    }
    function productLine(item: Order["items"][number], quantity: number) {
        return <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={44} height={44} unoptimized className="h-full w-full object-cover" /> : <Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />}
            </div>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.name}</p><p className="text-xs text-text-secondary">{[item.color, item.size].filter(Boolean).join(" · ")}</p></div>
            <span className="shrink-0 text-sm tabular-nums">{quantity} × {item.unitPrice} ₾</span>
        </div>;
    }
    if (!open) return <section className="rounded-2xl border border-success/30 bg-success/5 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon icon="solar:check-circle-linear" className="h-5 w-5 text-success" />ნივთების მიღება დადასტურებულია</h3>
        <p className="mt-2 text-xs text-text-secondary">ახლა აირჩიე ახალი ნივთები. კლიენტის მონაცემები უცვლელი დარჩება; შენახვამდე ფასის სხვაობასაც ნახავ.</p>
        <button type="button" disabled={blocked} onClick={() => { if (onStart()) setOpen(true); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-40"><Icon icon="solar:transfer-horizontal-linear" className="h-5 w-5" />აირჩიე ახალი ნივთები</button>
    </section>;

    return <section className="space-y-4 rounded-2xl border border-accent/30 bg-surface p-4">
        <div><h3 className="flex items-center gap-2 font-semibold"><Icon icon="solar:transfer-horizontal-linear" className="h-5 w-5 text-accent" />გადაცვლა — ახალი ნივთების არჩევა</h3><p className="mt-2 text-xs text-text-secondary">დაბრუნება უკვე აღრიცხულია. ამ ეტაპზე დაამატე მხოლოდ სანაცვლოდ გასაგზავნი ახალი ნივთები.</p></div>
        <div className="space-y-2"><h4 className="text-sm font-medium">უკვე დაბრუნებულია</h4>{returned.map(item => productLine(item, item.receivedReturnQuantity))}</div>
        {kept.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">კლიენტთან რჩება</h4><p className="text-xs text-text-secondary">ეს ნივთები შეკვეთაში დარჩება. ხელახლა დამატება არ არის საჭირო.</p>{kept.map(item => productLine(item, item.quantity))}</div>}
        <fieldset disabled={blocked} className="min-w-0 space-y-3 disabled:opacity-60">
            <legend className="mb-2 text-sm font-semibold">ახალი ნივთები</legend>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPicker(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-success/40 px-3 text-sm text-success"><Icon icon="solar:box-linear" className="h-5 w-5" />მარაგიდან არჩევა</button>
                <button type="button" onClick={() => { setItems(current => [...current, manualOrderItem()]); onDirty(); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm"><Icon icon="solar:add-circle-linear" className="h-5 w-5" />ხელით დამატება</button>
            </div>
            {items.map((item, index) => <OrderProductEditor
                key={item.key}
                item={item}
                index={index}
                update={values => change(item.key, values)}
                remove={() => {
                    setItems(current => current.filter(value => value.key !== item.key));
                    onDirty();
                }}
            />)}
        </fieldset>
        <div className="rounded-xl border border-border bg-background p-3">
            <h4 className="mb-3 text-sm font-semibold">გადაცვლის შეჯამება</h4>
            <dl className="space-y-2 text-xs sm:text-sm">
                {[["დაბრუნებული ნივთების ღირებულება", oldReturnedTotal], ["კლიენტთან დარჩენილი ნივთები", keptTotal], ["ახალი ნივთები", newTotal], ["მიწოდება", moneyCents(order.courierFee) ?? 0n], ["ახალი შეკვეთის ჯამი", total], ["უკვე გადახდილია", paid]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-text-secondary">{String(label)}</dt><dd className="shrink-0 font-semibold tabular-nums">{moneyText(value as bigint)} ₾</dd></div>)}
                <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold"><dt>{balance < 0n ? "კლიენტს დასაბრუნებელი" : balance > 0n ? "დამატებით გადასახდელი" : "თანხის სხვაობა"}</dt><dd className="shrink-0 tabular-nums">{moneyText(balance < 0n ? -balance : balance)} ₾</dd></div>
            </dl>
            {balance < 0n && <p className="mt-3 text-xs text-warning">გადაცვლის შენახვა თანხის დაბრუნებას არ ადასტურებს. გადახდილი თანხა მხოლოდ რეალური დაბრუნების დადასტურების შემდეგ შემცირდება.</p>}
        </div>
        <p className="text-xs text-text-secondary">შენახვისას ახალი ნივთები მარაგს მოაკლდება და შეკვეთა გადავა „მუშავდება“-ზე. კლიენტის ინფორმაცია და უკვე აღრიცხული გადახდები უცვლელი დარჩება.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
            <button type="button" disabled={blocked || uploading} onClick={() => { if (onCancel()) { setOpen(false); setItems([]); setError(""); } }} className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-40">გადაცვლის გაუქმება</button>
            <button type="button" disabled={blocked || uploading || !items.length} onClick={submit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-40"><Icon icon="solar:check-circle-linear" className="h-5 w-5" />{uploading ? "ფოტო იტვირთება…" : "გადაცვლის შენახვა"}</button>
        </div>
        {picker && <OrderInventoryPicker items={items} close={() => setPicker(false)} choose={choose} />}
    </section>;
}
