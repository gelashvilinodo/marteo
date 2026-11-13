"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/shared/Icon";
import { DemoPlayer } from "./Player";
import { Header, Sidebar, business } from "./Shell";
import { OrdersPage } from "./Pages";
import { ProductThumb } from "./ui";
import { buildAfterFrame, buildAfterScript, type AfterFrame } from "./afterTimeline";
import { customer, money, order, ordered, orderTotal } from "./data";
import type { DemoDates } from "./engine";

// „როგორ მუშაობს" #2: რა ხდება შეკვეთის შემდეგ — ინვოისი, მომხმარებლის ბმული, გაგზავნა და SMS.
export default function AfterOrder() {
    return (
        <DemoPlayer
            id="after-order"
            className="rounded-t-[2rem] border-t border-border shadow-[0_-2rem_4rem_-1rem_rgb(2_8_23/0.35)] sm:rounded-t-[3rem]"
            eyebrow={{ icon: "solar:document-text-linear", label: "შეკვეთის შემდეგ" }}
            title="ინვოისი, ბმული და SMS — ავტომატურად"
            subtitle="დაბეჭდეთ ინვოისი, გაუზიარეთ მომხმარებელს პირადი ბმული და შეკვეთის გაგზავნისას მას SMS თავისით მიუვა."
            buildScript={buildAfterScript}
            render={(t, script, dates) => <AfterApp frame={buildAfterFrame(t, script)} m={script.mode === "mobile"} dates={dates} />}
        />
    );
}

const link = "marteo.ge/o/7f3c9a1e52b84d0c";
const phoneNumber = "+995 599 48 21 07";
const smsText = `${business.name}: თქვენი შეკვეთა კურიერს გადაეცა, მალე მიიღებთ.`;

function AfterApp({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    return (
        <div className="relative flex h-full w-full bg-background font-sans text-text-primary">
            {!m && <Sidebar frame={frame} />}

            <div className="relative flex min-w-0 flex-1 flex-col">
                <Header frame={frame} m={m} />
                <div className="relative min-h-0 flex-1">
                    <div data-demo-scroll className="absolute inset-0 overflow-hidden">
                        <div data-demo-scroll-content>
                            <OrdersPage orders={frame.orders} m={m} dates={dates} />
                        </div>
                    </div>
                </div>
            </div>

            <DetailsModal frame={frame} m={m} dates={dates} />
            <InvoiceModal frame={frame} m={m} dates={dates} />
            <PrintedToast frame={frame} m={m} />
            <CustomerView frame={frame} m={m} dates={dates} />
            <SmsView frame={frame} m={m} dates={dates} />
        </div>
    );
}

function Overlay({ k, children }: { k: number; children: ReactNode }) {
    return (
        <div className="absolute inset-0 z-40" style={{ opacity: k }}>
            <div className="absolute inset-0 bg-[rgb(2_8_23/0.55)] backdrop-blur-[3px]" />
            {children}
        </div>
    );
}

function IconButton({ icon, tone = "text-text-primary", demo, pressed, m }: { icon: string; tone?: string; demo?: string; pressed?: boolean; m: boolean }) {
    return (
        <span
            data-demo={demo}
            className={`flex shrink-0 items-center justify-center rounded-2xl border transition-transform ${m ? "h-12 w-12" : "h-14 w-14"} ${tone} ${pressed ? "scale-90" : ""}`}
        >
            <Icon icon={icon} className="h-6 w-6" />
        </span>
    );
}

// ———————————————————————————— შეკვეთის დეტალები ————————————————————————————

function DetailsModal({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    if (!frame.detailsVisible) return null;
    const k = frame.detailsIn;

    const info = [
        ["მიმღები", `${customer.firstName} ${customer.lastName}`],
        ["ტელეფონი", phoneNumber],
        ["მიწოდება", customer.zone],
        ["მისამართი", customer.address],
        ["თარიღი", `${dates.today} 12:40`],
        ["გააფორმა", business.owner],
    ];

    return (
        <Overlay k={k}>
            <div
                className={`absolute overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_2rem_5rem_-1rem_rgb(2_8_23/0.6)] ${
                    m ? "inset-x-3 top-3 bottom-3 p-5" : "top-10 bottom-10 left-1/2 w-[740px] -translate-x-1/2 p-8"
                }`}
                style={{ scale: `${0.96 + k * 0.04}` }}
            >
                <div className="flex items-start justify-between gap-3">
                    <p className={`font-bold text-text-primary ${m ? "text-[22px] leading-tight" : "text-[24px]"}`}>
                        შეკვეთა{m ? <br /> : " "}
                        {order.number}
                    </p>
                    <span className="flex gap-2">
                        <IconButton m={m} icon="solar:document-text-linear" tone="border-accent/40 text-accent" demo="details-invoice" pressed={frame.pressed("details-invoice")} />
                        <IconButton m={m} icon="solar:pen-new-square-linear" tone="border-accent/40 text-accent" />
                        <IconButton m={m} icon="solar:trash-bin-trash-linear" tone="border-danger/40 text-danger" />
                        <IconButton m={m} icon="solar:close-circle-linear" tone="border-border text-text-primary" demo="details-close" pressed={frame.pressed("details-close")} />
                    </span>
                </div>

                <div className="mt-6 flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${frame.shipped ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"}`}>
                        <Icon icon={frame.shipped ? "solar:delivery-linear" : "solar:clock-circle-linear"} className="h-4 w-4" />
                        {frame.shipped ? "გაგზავნილი" : "მუშავდება"}
                        <Icon icon="solar:alt-arrow-down-linear" className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[16px] text-text-secondary">გადახდილი</span>
                </div>

                <p
                    key={String(frame.printed)}
                    className={`demo-pop mt-5 flex items-center gap-2 rounded-2xl border px-4 py-3.5 text-[15px] ${
                        frame.printed ? "border-success/40 bg-success/10 text-success" : "border-border bg-background text-text-secondary"
                    }`}
                >
                    <Icon icon={frame.printed ? "solar:printer-bold-duotone" : "solar:document-text-linear"} className={`h-5 w-5 ${frame.printed ? "" : "text-accent"}`} />
                    {frame.printed ? `ინვოისი დაიბეჭდა · ${dates.today}` : "ინვოისი ჯერ არ დაბეჭდილა."}
                </p>

                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
                    {info.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                            <dt className="text-[15px] text-text-secondary">{label}</dt>
                            <dd className="mt-1 truncate text-[16px] text-text-primary">{value}</dd>
                        </div>
                    ))}
                </dl>

                <p className="mt-6 text-[18px] font-bold text-text-primary">პროდუქტები</p>
                <div className="mt-3 rounded-2xl border border-border p-4">
                    <div className="flex items-start gap-4">
                        <ProductThumb icon={ordered.icon} tint={ordered.tint} size="h-16 w-16" iconSize="h-10 w-10" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[17px] font-bold text-text-primary">{ordered.name}</span>
                            <span className="block text-sm text-text-secondary">{ordered.variant}</span>
                            <span className="mt-2 flex justify-between text-[16px] font-semibold text-text-primary tabular-nums">
                                <span>1 × {money(ordered.price)}</span>
                                <span>{money(ordered.price)}</span>
                            </span>
                        </span>
                    </div>
                </div>

                <div className="mt-5 border-t border-border pt-5">
                    <p className="text-[18px] font-bold text-text-primary">გადახდები</p>
                    <p className="mt-2 text-sm text-text-secondary">
                        {dates.today} 12:40 · გადარიცხვა · {order.bank} · {money(orderTotal)}
                    </p>
                    <p className="mt-3 flex justify-between text-[16px] text-text-secondary">
                        პროდუქტები <span className="font-bold text-text-primary tabular-nums">{money(ordered.price)}</span>
                    </p>
                    <p className="mt-2 flex justify-between text-[16px] text-text-secondary">
                        კურიერის საფასური <span className="font-bold text-text-primary tabular-nums">{money(order.courier)}</span>
                    </p>
                </div>
            </div>
        </Overlay>
    );
}

// ———————————————————————————— ინვოისი ————————————————————————————

function InvoiceModal({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    if (!frame.invoiceVisible) return null;
    const k = frame.invoiceIn;

    return (
        <Overlay k={k}>
            <div
                className={`absolute flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_2rem_5rem_-1rem_rgb(2_8_23/0.6)] ${
                    m ? "inset-x-3 top-3 bottom-3" : "top-6 bottom-6 left-1/2 w-[780px] -translate-x-1/2"
                }`}
                style={{ scale: `${0.96 + k * 0.04}` }}
            >
                <div className={`flex shrink-0 items-center justify-between border-b border-border ${m ? "px-4 py-3" : "px-7 py-4"}`}>
                    <p className="flex items-center gap-2 text-[20px] font-bold text-text-primary">
                        <Icon icon="solar:document-text-linear" className="h-6 w-6 text-accent" />
                        ინვოისი
                    </p>
                    <IconButton m icon="solar:close-circle-linear" tone="border-border text-text-primary" demo="invoice-close" pressed={frame.pressed("invoice-close")} />
                </div>

                <div className={`flex min-h-0 flex-1 flex-col ${m ? "gap-3 p-4" : "gap-4 px-7 py-5"}`}>
                    <p key={String(frame.printed)} className={`demo-pop text-sm ${frame.printed ? "font-semibold text-success" : "text-text-secondary"}`}>
                        {frame.printed ? "დაბეჭდილია · ვერსია 1" : "ახალი ინვოისი · ვერსია 1"}
                    </p>

                    <div className="flex justify-center gap-3">
                        <span className={`flex h-12 items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 text-[15px] text-text-primary ${m ? "flex-1" : "w-52"}`}>
                            10 × 15 სმ
                            <Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" />
                        </span>
                        <span
                            data-demo="invoice-print"
                            className={`inline-flex h-12 items-center gap-2 rounded-xl bg-success px-5 text-[15px] font-semibold text-white shadow-lg shadow-success/25 transition-transform ${
                                frame.pressed("invoice-print") ? "scale-95 bg-success-hover" : ""
                            }`}
                        >
                            <Icon icon={frame.printing ? "solar:refresh-linear" : "solar:printer-linear"} className={`h-5 w-5 ${frame.printing ? "animate-spin" : ""}`} />
                            {frame.printing ? "იბეჭდება…" : "ბეჭდვა / PDF"}
                        </span>
                    </div>

                    <InvoicePaper frame={frame} m={m} dates={dates} />

                    <div className={`grid gap-3 ${m ? "grid-cols-2" : "grid-cols-3"}`}>
                        {!m && (
                            <span className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-[15px] text-text-primary">
                                <Icon icon="solar:copy-linear" className="h-5 w-5 text-accent" />
                                ბმულის კოპირება
                            </span>
                        )}
                        <span className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-[15px] text-text-primary">
                            <Icon icon="solar:share-linear" className="h-5 w-5 text-accent" />
                            გაზიარება
                        </span>
                        <span
                            data-demo="invoice-customer"
                            className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-[15px] font-semibold transition-[transform,background-color] ${
                                frame.near("invoice-customer") ? "border-accent bg-accent/10 text-accent" : "border-border text-text-primary"
                            } ${frame.pressed("invoice-customer") ? "scale-95" : ""}`}
                        >
                            <Icon icon="solar:smartphone-linear" className="h-5 w-5 text-accent" />
                            {m ? "მომხმ. გვერდი" : "მომხმარებლის გვერდი"}
                        </span>
                    </div>

                    {!m && (
                        <div>
                            <p className="mb-1.5 text-sm text-text-secondary">მომხმარებლის ბმული</p>
                            <span className="flex h-12 items-center rounded-xl border border-border bg-background px-4 text-[15px] text-text-primary">https://{link}…</span>
                        </div>
                    )}
                </div>
            </div>
        </Overlay>
    );
}

// QR კოდის ვიზუალი: სამი კუთხის კვადრატი და განმეორებადი „შემთხვევითი“ წერტილები.
function QrCode({ size }: { size: number }) {
    const n = 21;
    const cell = size / n;
    const finder = (x: number, y: number) => x < 7 && y < 7;
    const inFinder = (x: number, y: number) => finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
    const cells: [number, number][] = [];
    for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
            if (inFinder(x, y)) continue;
            if (((x * 73 + y * 151 + x * y * 7) % 11) < 5) cells.push([x, y]);
        }
    }
    const marks = [
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
    ];

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
            {cells.map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#0f172a" />
            ))}
            {marks.map(([x, y]) => (
                <g key={`${x}-${y}`}>
                    <rect x={x * cell} y={y * cell} width={cell * 7} height={cell * 7} fill="#0f172a" />
                    <rect x={(x + 1) * cell} y={(y + 1) * cell} width={cell * 5} height={cell * 5} fill="#fff" />
                    <rect x={(x + 2) * cell} y={(y + 2) * cell} width={cell * 3} height={cell * 3} fill="#0f172a" />
                </g>
            ))}
        </svg>
    );
}

// ქაღალდი ორივე რეჟიმში თეთრია, როგორც ნამდვილ ინვოისზე.
function InvoicePaper({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    const progress = frame.printProgress;

    return (
        <div
            data-demo="invoice-paper"
            className={`relative mx-auto w-full overflow-hidden rounded-2xl bg-white text-slate-900 shadow-[0_1.5rem_3rem_-1rem_rgb(2_8_23/0.5)] transition-transform duration-300 ${
                m ? "p-4 text-[11px]" : "max-w-[430px] p-5 text-[12px]"
            } ${frame.printing ? "-translate-y-1" : ""}`}
        >
            <div className="flex items-start justify-between">
                <p className={`font-bold ${m ? "text-[15px]" : "text-[17px]"}`}>{business.name}</p>
                <p className="text-right">
                    <span className="block font-bold">ინვოისი {order.number}</span>
                    <span className="block text-slate-500">{dates.today}</span>
                </p>
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3 leading-relaxed">
                <p>
                    <b>მიმღები:</b> {customer.firstName} {customer.lastName}
                </p>
                <p>{phoneNumber}</p>
                <p>{customer.address}</p>
                <p>
                    მუშავდება · <b>გადახდილი</b>
                </p>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_3rem_4rem_4rem] border-t border-slate-200 pt-2 font-bold">
                <span>პროდუქტი</span>
                <span>რაოდ.</span>
                <span className="text-right">ფასი ₾</span>
                <span className="text-right">ჯამი ₾</span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_3rem_4rem_4rem] items-center border-b border-slate-200 pb-2">
                <span className="flex min-w-0 items-center gap-2">
                    <ProductThumb icon={ordered.icon} tint={ordered.tint} size="h-8 w-8" iconSize="h-5 w-5" />
                    <span className="min-w-0 truncate font-semibold">{ordered.name}</span>
                </span>
                <span className="text-center">1</span>
                <span className="text-right tabular-nums">{ordered.price.toFixed(2)}</span>
                <span className="text-right tabular-nums">{ordered.price.toFixed(2)}</span>
            </div>

            <div className="mt-3 flex items-start gap-4">
                <span className="flex flex-col items-center gap-1 text-center text-slate-500">
                    <QrCode size={m ? 74 : 92} />
                    <span className="text-[10px] leading-tight">შეკვეთის დეტალების<br />ნახვა</span>
                </span>
                <dl className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex justify-between"><dt>პროდუქტები</dt><dd className="tabular-nums">{money(ordered.price)}</dd></div>
                    <div className="flex justify-between"><dt>მიწოდება</dt><dd className="tabular-nums">{money(order.courier)}</dd></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5"><dt>სულ</dt><dd className="tabular-nums">{money(orderTotal)}</dd></div>
                    <div className={`flex justify-between font-bold ${m ? "text-[13px]" : "text-[15px]"}`}><dt>გადახდილი</dt><dd className="tabular-nums">{money(orderTotal)}</dd></div>
                </dl>
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-400">შექმნილია MARTEO-ს დახმარებით</p>

            {/* ბეჭდვისას ქაღალდზე ზოლი ჩამოდის, ბოლოს „დაბეჭდილია“ ბეჭედი ჩნდება. */}
            {frame.printing && (
                <>
                    <span className="absolute inset-x-0 top-0 bg-[rgb(90_141_238/0.08)]" style={{ height: `${progress * 100}%` }} />
                    <span className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_18px_4px_rgb(90_141_238/0.6)]" style={{ top: `${progress * 100}%` }} />
                </>
            )}
            {frame.printed && (
                <span className="demo-pop absolute top-14 right-4 inline-flex -rotate-6 items-center gap-1.5 rounded-lg border-2 border-emerald-500 px-2.5 py-1 text-[12px] font-bold text-emerald-600">
                    <Icon icon="solar:check-circle-bold" className="h-4 w-4" />
                    დაბეჭდილია
                </span>
            )}
        </div>
    );
}

function PrintedToast({ frame, m }: { frame: AfterFrame; m: boolean }) {
    return (
        <div
            className={`absolute z-[55] flex items-center gap-3 rounded-2xl border border-success/30 bg-surface p-3 pr-5 text-sm text-text-primary shadow-xl transition-all duration-300 ${
                m ? "inset-x-6 bottom-6" : "bottom-8 left-1/2 -translate-x-1/2"
            } ${frame.printedToast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
        >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
                <Icon icon="solar:printer-bold-duotone" className="h-6 w-6" />
            </span>
            <span>
                <span className="block font-semibold">ინვოისი {order.number} დაიბეჭდა</span>
                <span className="block text-xs text-text-secondary">შეკვეთას დაბეჭდილის ნიშანი დაემატა</span>
            </span>
        </div>
    );
}

// ———————————————————————————— მომხმარებლის მხარე ————————————————————————————

function Label({ icon, children }: { icon: string; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-accent/30">
            <Icon icon={icon} className="h-4 w-4" />
            {children}
        </span>
    );
}

// მარტივი ტელეფონის ჩარჩო (დესკტოპის დემოში მომხმარებლის მხარის საჩვენებლად).
function PhoneFrame({ demo, label, children }: { demo: string; label: ReactNode; children: ReactNode }) {
    return (
        <div data-demo={demo} className="relative h-[700px] w-[340px]">
            <span className="absolute top-28 right-full mr-5">{label}</span>
            <div className="relative h-full w-full overflow-hidden rounded-[3rem] border-[10px] border-[#0b1220] bg-background shadow-[0_2.5rem_5rem_-1rem_rgb(2_8_23/0.7)] ring-1 ring-white/10">
                <span className="absolute top-2.5 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-[#0b1220]" />
                {children}
            </div>
        </div>
    );
}

function CustomerPage({ frame, dates }: { frame: AfterFrame; dates: DemoDates }) {
    const card = "rounded-2xl border border-border bg-surface p-4";
    return (
        <div className="space-y-3 p-3" style={{ transform: `translateY(${-frame.customerScroll * 230}px)` }}>
            <div className={`${card} flex items-center gap-3`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-xl font-bold text-accent">თ</span>
                <span>
                    <span className="block text-[17px] font-bold text-text-primary">{business.name}</span>
                    <span className="block text-sm text-text-secondary">თქვენი შეკვეთის ინფორმაცია</span>
                </span>
            </div>

            <div className={card}>
                <p className="flex justify-between text-[16px] font-bold text-text-primary">
                    შეკვეთა {order.number}
                    <span className="text-sm font-normal text-text-secondary">{dates.today}</span>
                </p>
                <div className="mt-3 flex gap-3 rounded-xl bg-warning/10 p-3">
                    <Icon icon="solar:clock-circle-linear" className="h-6 w-6 shrink-0 text-warning" />
                    <span>
                        <span className="block font-semibold text-warning">მუშავდება</span>
                        <span className="block text-sm text-text-secondary">მაღაზია ამზადებს თქვენს შეკვეთას.</span>
                    </span>
                </div>
            </div>

            <div className={card}>
                <p className="flex items-center gap-2 text-[16px] font-bold text-text-primary">
                    <Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />
                    პროდუქტები
                </p>
                <div className="mt-3 flex items-center gap-3">
                    <ProductThumb icon={ordered.icon} tint={ordered.tint} size="h-14 w-14" iconSize="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text-primary">{ordered.name}</span>
                        <span className="block text-xs text-text-secondary">{ordered.variant}</span>
                        <span className="mt-1 flex justify-between text-sm tabular-nums">
                            <span className="text-text-secondary">1 × {money(ordered.price)}</span>
                            <span className="font-bold text-text-primary">{money(ordered.price)}</span>
                        </span>
                    </span>
                </div>
            </div>

            <div className={card}>
                <p className="flex items-center gap-2 text-[16px] font-bold text-text-primary">
                    <Icon icon="solar:wallet-linear" className="h-5 w-5 text-accent" />
                    თანხის შეჯამება
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between text-text-secondary"><dt>პროდუქტები</dt><dd className="text-text-primary tabular-nums">{money(ordered.price)}</dd></div>
                    <div className="flex justify-between text-text-secondary"><dt>მიწოდება</dt><dd className="text-text-primary tabular-nums">{money(order.courier)}</dd></div>
                    <div className="flex justify-between border-t border-border pt-2 text-[17px] font-bold text-text-primary"><dt>სულ</dt><dd className="tabular-nums">{money(orderTotal)}</dd></div>
                    <div className="flex justify-between text-text-secondary"><dt>გადახდილი</dt><dd className="text-success tabular-nums">{money(orderTotal)}</dd></div>
                    <div className="flex justify-between text-text-secondary"><dt>დარჩენილი თანხა</dt><dd className="font-bold text-text-primary tabular-nums">{money(0)}</dd></div>
                </dl>
                <p className="mt-3 rounded-xl bg-background px-3 py-2.5 text-sm text-text-primary">გადახდილი</p>
            </div>

            <p className="pt-1 text-center text-xs text-text-secondary">კითხვების შემთხვევაში დაუკავშირდით მაღაზიას.</p>
        </div>
    );
}

function BrowserBar() {
    return (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 pt-10 pb-2.5">
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-background px-3 text-xs text-text-secondary">
                <Icon icon="solar:lock-keyhole-minimalistic-bold" className="h-3.5 w-3.5 shrink-0 text-success" />
                <span className="truncate">{link}</span>
            </span>
        </div>
    );
}

function CustomerView({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    if (!frame.customerVisible) return null;
    const k = frame.customerIn;

    if (m) {
        return (
            <div className="absolute inset-0 z-50 flex flex-col bg-background" style={{ transform: `translateY(${(1 - k) * 100}%)` }}>
                <BrowserBar />
                <span className="absolute top-2.5 left-1/2 z-10 -translate-x-1/2">
                    <Label icon="solar:user-linear">მომხმარებლის ხედი</Label>
                </span>
                <div data-demo="customer-phone" className="relative min-h-0 flex-1 overflow-hidden">
                    <CustomerPage frame={frame} dates={dates} />
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-50" style={{ opacity: Math.min(k * 2, 1) }}>
            <div className="absolute inset-0 bg-[rgb(2_8_23/0.45)]" />
            <div className="absolute top-[100px] left-1/2 ml-[290px]" style={{ transform: `translate(-50%, ${(1 - k) * 60}px)` }}>
                <PhoneFrame demo="customer-phone" label={<Label icon="solar:user-linear">მომხმარებლის ხედი</Label>}>
                    <div className="flex h-full flex-col">
                        <BrowserBar />
                        <div className="relative min-h-0 flex-1 overflow-hidden">
                            <CustomerPage frame={frame} dates={dates} />
                        </div>
                    </div>
                </PhoneFrame>
            </div>
        </div>
    );
}

function LockScreen({ frame, dates }: { frame: AfterFrame; dates: DemoDates }) {
    const a = frame.smsArrive;
    return (
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(165deg,#0b2a55_0%,#1b4a92_55%,#5a8dee_100%)] text-white">
            <span className="absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col items-center pt-16">
                <Icon icon="solar:lock-keyhole-minimalistic-bold" className="h-5 w-5 text-white/80" />
                <p className="mt-2 text-sm text-white/80">{dates.today}</p>
                <p className="text-[64px] leading-none font-semibold tracking-tight">12:41</p>
            </div>

            <div
                data-demo="sms-card"
                className="relative mx-3 mt-8 rounded-[22px] bg-white/20 p-3.5 shadow-[0_1rem_2rem_-0.5rem_rgb(2_8_23/0.45)] ring-1 ring-white/25 backdrop-blur-md"
                style={{ opacity: a, transform: `translateY(${(1 - a) * -24}px) scale(${0.94 + a * 0.06})` }}
            >
                <div className="flex items-center gap-2 text-xs">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success">
                        <Icon icon="solar:chat-round-line-bold" className="h-4 w-4 text-white" />
                    </span>
                    <span className="font-bold tracking-wide">MARTEO</span>
                    <span className="ml-auto text-white/70">ახლა</span>
                </div>
                <p className="mt-2 text-[14px] leading-snug">{smsText}</p>
            </div>
        </div>
    );
}

function SmsView({ frame, m, dates }: { frame: AfterFrame; m: boolean; dates: DemoDates }) {
    if (!frame.smsVisible) return null;
    const k = frame.smsIn;
    const label = <Label icon="solar:smartphone-linear">{m ? "მომხმარებლის ტელეფონი" : `მომხმარებლის ტელეფონი · ${phoneNumber}`}</Label>;

    if (m) {
        return (
            <div className="absolute inset-0 z-50" style={{ transform: `translateY(${(1 - k) * 100}%)` }}>
                <LockScreen frame={frame} dates={dates} />
                <span className="absolute top-4 left-1/2 -translate-x-1/2">{label}</span>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-50" style={{ opacity: Math.min(k * 2, 1) }}>
            <div className="absolute inset-0 bg-[rgb(2_8_23/0.4)]" />
            <div className="absolute top-[100px] left-1/2 ml-[290px]" style={{ transform: `translate(-50%, ${(1 - k) * 60}px)` }}>
                <PhoneFrame demo="sms-phone" label={label}>
                    <LockScreen frame={frame} dates={dates} />
                </PhoneFrame>
            </div>
        </div>
    );
}
