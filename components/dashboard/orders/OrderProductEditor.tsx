"use client";

import Image from "next/image";
import { Icon } from "@iconify/react";
import OrderPhotoUpload from "./OrderPhotoUpload";
import { moneyCents, moneyText, type OrderFormItem } from "@/lib/orders/order-form";
import { useEffect, useRef } from "react";

const input = "h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent lg:h-10 lg:text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block min-w-0"><span className="mb-1 block text-xs text-text-secondary">{label}</span>{children}</label>;
}
export default function OrderProductEditor({
    item,
    index,
    update,
    remove,
    readOnly = false,
    onRemovingChange,
}: {
    item: OrderFormItem;
    index: number;
    update: (patch: Partial<OrderFormItem>) => void;
    remove: () => void;
    readOnly?: boolean;
    onRemovingChange?: (removing: boolean) => void;
}) {
    const cardRef = useRef<HTMLElement>(null);
    const removing = useRef(false);
    const animationRef = useRef<Animation | null>(null);

    useEffect(() => {
        const card = cardRef.current;

        if (
            !card ||
            window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches
        ) {
            return;
        }

        const height = card.getBoundingClientRect().height;
        const style = window.getComputedStyle(card);

        const animation = card.animate(
            [
                {
                    height: "0px",
                    paddingTop: "0px",
                    paddingBottom: "0px",
                    opacity: 0,
                    transform: "translateY(-20px)",
                },
                {
                    height: `${height}px`,
                    paddingTop: style.paddingTop,
                    paddingBottom: style.paddingBottom,
                    opacity: 1,
                    transform: "translateY(0)",
                },
            ],
            {
                duration: 350,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
        );

        animationRef.current = animation;

        return () => {
            animationRef.current?.cancel();
        };
    }, []);

    function animatedRemove() {
        if (removing.current) return;

        const card = cardRef.current;

        if (
            !card ||
            window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches
        ) {
            remove();
            return;
        }

        removing.current = true;
        onRemovingChange?.(true);
        animationRef.current?.cancel();

        const height = card.getBoundingClientRect().height;

        const animation = card.animate(
            [
                {
                    height: `${height}px`,
                    opacity: 1,
                    transform: "translateX(0)",
                },
                {
                    height: `${height}px`,
                    opacity: 0,
                    transform: "translateX(-40px)",
                    offset: 0.55,
                },
                {
                    height: "0px",
                    paddingTop: "0px",
                    paddingBottom: "0px",
                    borderWidth: "0px",
                    opacity: 0,
                    transform: "translateX(-40px)",
                },
            ],
            {
                duration: 350,
                easing: "ease-in-out",
                fill: "forwards",
            },
        );

        animationRef.current = animation;

        animation.onfinish = () => {
            remove();
            onRemovingChange?.(false);
        };
    }
    const productLabelNumber = item.displayNumber ?? index + 1;
    const available = item.condition === "DEFECTIVE" ? item.defectiveStock : item.goodStock;
    const cents = moneyCents(item.unitPrice);
    const total = cents !== null && /^\d+$/.test(item.quantity) ? moneyText(cents * BigInt(item.quantity)) : "—";
    if (readOnly) {
        return (
            <article ref={cardRef} className="min-w-0 rounded-2xl border border-border bg-background p-3 sm:p-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border">
                        {item.imageUrl ? (
                            <Image
                                src={item.imageUrl}
                                alt={item.name}
                                width={48}
                                height={48}
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
                        <p className="break-words text-sm font-semibold">
                            {item.name}
                        </p>

                        <p className="mt-1 text-xs text-text-secondary">
                            {[
                                item.color,
                                item.size,
                                item.condition === "DEFECTIVE"
                                    ? "წუნდებული"
                                    : "დაუზიანებელი",
                            ].filter(Boolean).join(" · ")}
                        </p>

                        <p className="mt-1 text-xs text-text-secondary">
                            {item.quantity} × {item.unitPrice} ₾
                        </p>
                    </div>

                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {total} ₾
                    </span>
                </div>

                <p className="mt-3 flex items-start gap-2 text-xs text-text-secondary">
                    <Icon
                        icon="solar:info-circle-linear"
                        className="h-4 w-4 shrink-0"
                    />
                    {item.isCarriedOver
                        ? "ეს ნივთი კლიენტთან დარჩა. შესაცვლელად გამოიყენე დაბრუნება ან გადაცვლა."
                        : "ამ სტატუსზე პროდუქტის შეცვლა შეუძლებელია."}
                </p>
            </article>
        );
    }
    return <article ref={cardRef} className="min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4 overflow-hidden overflow-hidden">
        <div className="mb-3 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={40} height={40} unoptimized className="h-full w-full object-cover" /> : <Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />}
            </div>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-text-secondary">პროდუქტი {productLabelNumber} · {item.source === "INVENTORY" ? "მარაგიდან" : "ხელით დამატებული"}</p>{item.source === "INVENTORY" && <p className="mt-1 text-xs text-text-secondary">ხელმისაწვდომია: {available ?? "—"}</p>}</div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">{total}{total !== "—" ? " ₾" : ""}</p>
            <button type="button" onClick={animatedRemove} aria-label={`პროდუქტი ${productLabelNumber} წაშლა`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-danger hover:bg-danger/10"><Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5" /></button>
        </div>
        {item.source === "MANUAL" && (
            <OrderPhotoUpload
                imageUrl={item.imageUrl}
                onChange={imageUrl => {
                    update({ imageUrl });
                }}
                onBusyChange={uploadPending => {
                    update({ uploadPending });
                }}
            />
        )}
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="col-span-2 lg:col-span-1"><Field label="სახელი *"><input value={item.name} onChange={event => update({ name: event.target.value })} required className={input} /></Field></div>
            <Field label="რაოდენობა *"><input inputMode="numeric" value={item.quantity} onChange={event => update({ quantity: event.target.value })} required className={input} /></Field>
            <Field label="გასაყიდი ფასი · ₾ *"><input inputMode="decimal" value={item.unitPrice} onChange={event => update({ unitPrice: event.target.value })} placeholder="0.00" required className={input} /></Field>
        </div>
        <details className="mt-3">
            <summary className="cursor-pointer text-xs text-text-secondary">ფერი, ზომა და დამატებითი ინფორმაცია</summary>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">
                <Field label="ფერი"><input value={item.color} onChange={event => update({ color: event.target.value })} className={input} /></Field>
                <Field label="ზომა"><input value={item.size} onChange={event => update({ size: event.target.value })} className={input} /></Field>
                {item.source === "MANUAL" ? <Field label="თვითღირებულება · ₾"><input inputMode="decimal" value={item.unitCost} onChange={event => update({ unitCost: event.target.value })} className={input} /></Field> : <Field label="მდგომარეობა"><select value={item.condition} onChange={event => update({ condition: event.target.value as OrderFormItem["condition"] })} className={input}><option value="GOOD">დაუზიანებელი</option><option value="DEFECTIVE">წუნდებული</option></select></Field>}
                <div className="col-span-2 lg:col-span-3"><Field label="აღწერა"><textarea rows={2} value={item.description} onChange={event => update({ description: event.target.value })} className={`${input} !h-auto py-2`} /></Field></div>
            </div>
        </details>
    </article>;
}
