import { Icon } from "@/components/shared/Icon";
import type { Frame } from "./timeline";
import type { DemoDates } from "./engine";

export type { DemoDates };
import { business } from "./Shell";
import { Delta, GreenButton, PageTitle, PeriodSelect, ProductThumb } from "./ui";
import {
    analyticsWeek,
    customer,
    existingOrders,
    expenses,
    group,
    homeDays,
    money,
    month,
    monthProfit,
    order,
    orderStatusStyle,
    ordered,
    orderedCost,
    orderTotal,
    products,
    weekCounts,
} from "./data";


type PageProps = { frame: Frame; m: boolean; dates: DemoDates };

const card = "rounded-2xl border border-border bg-surface";

function SummaryCard({ label, value, icon, tone, m, children }: { label: string; value: string; icon: string; tone: string; m: boolean; children?: React.ReactNode }) {
    return (
        <div className={`${card} min-w-0 ${m ? "p-4" : "p-6"}`}>
            <span className={`flex items-center justify-center rounded-xl ${tone} ${m ? "h-12 w-12" : "h-11 w-11"}`}>
                <Icon icon={icon} className="h-6 w-6" />
            </span>
            <p className={`mt-4 truncate text-text-secondary ${m ? "text-[15px]" : "text-[15px] font-medium"}`}>{label}</p>
            <p className={`mt-2 truncate font-bold text-text-primary tabular-nums ${m ? "text-[22px]" : "text-[28px]"}`}>{value}</p>
            {children}
        </div>
    );
}

// ———————————————————————————— მთავარი ————————————————————————————

export function HomePage({ frame, m, dates }: PageProps) {
    const period = dates.period;
    const max = 600;

    return (
        <div className={`flex flex-col ${m ? "gap-4 p-4" : "gap-6 p-8"}`}>
            <div className={`flex ${m ? "flex-col gap-4" : "items-start justify-between"}`}>
                <div>
                    <PageTitle title="მთავარი" m={m} />
                    <div className="mt-4 flex items-center gap-4">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                            <Icon icon="solar:moon-bold-duotone" className="h-7 w-7" />
                        </span>
                        <p className="text-[17px] text-text-secondary">
                            მოგესალმებით, <span className="font-bold text-text-primary">{business.owner}</span>!
                        </p>
                    </div>
                </div>

                <div className={`flex ${m ? "flex-col-reverse gap-3" : "items-center gap-4"}`}>
                    <PeriodSelect label="ერთი თვე" m={m} />
                    <GreenButton demo="new-order" pressed={frame.pressed("new-order")} className={`h-14 px-7 text-[17px] ${m ? "w-full" : ""}`}>
                        <Icon icon="solar:add-circle-linear" className="h-6 w-6" />
                        ახალი შეკვეთა
                    </GreenButton>
                </div>
            </div>

            <p className="-mt-2 text-sm text-text-secondary">პერიოდი: {period}</p>

            <div className={`grid ${m ? "grid-cols-2 gap-3" : "grid-cols-4 gap-5"}`}>
                <SummaryCard m={m} label="სულ გაყიდვები" value={money(month.sales)} icon="solar:cart-large-2-bold-duotone" tone="bg-accent/10 text-accent" />
                <SummaryCard m={m} label="სუფთა მოგება" value={money(monthProfit)} icon="solar:chart-2-bold-duotone" tone="bg-success/10 text-success" />
                <SummaryCard m={m} label="სულ შეკვეთები" value={String(month.orders)} icon="solar:clipboard-list-bold-duotone" tone="bg-accent/10 text-accent" />
                <SummaryCard m={m} label="ამჟამად მარაგში" value={group(month.stockUnits)} icon="solar:box-bold-duotone" tone="bg-warning/10 text-warning" />
            </div>

            <div className={`grid gap-5 ${m ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className={`${card} p-6`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[19px] font-bold text-text-primary">გაყიდვები და სუფთა მოგება</p>
                        <span className="flex gap-4 text-sm text-text-secondary">
                            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-accent" />გაყიდვები</span>
                            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-success" />სუფთა მოგება</span>
                        </span>
                    </div>
                    <div className="relative mt-6 grid h-[230px] grid-cols-[3.5rem_1fr] gap-2">
                        <div className="relative">
                            {[600, 400, 200, 0].map(tick => (
                                <span key={tick} className="absolute right-0 -translate-y-1/2 text-xs text-text-secondary tabular-nums" style={{ top: `${(1 - tick / max) * 88}%` }}>
                                    {tick} ₾
                                </span>
                            ))}
                        </div>
                        <div className="relative">
                            {[600, 400, 200, 0].map(tick => (
                                <span key={tick} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(1 - tick / max) * 88}%` }} />
                            ))}
                            <div className="absolute inset-x-0 top-0 flex h-[88%] items-end justify-around">
                                {homeDays.map(day => (
                                    <span key={day.day} className="flex h-full items-end gap-1">
                                        <span className="w-3 rounded-t-md bg-accent" style={{ height: `${(day.sales / max) * 100}%` }} />
                                        <span className="w-3 rounded-t-md bg-success" style={{ height: `${(day.profit / max) * 100}%` }} />
                                    </span>
                                ))}
                            </div>
                            <div className="absolute inset-x-0 bottom-0 flex justify-around text-xs text-text-secondary tabular-nums">
                                {homeDays.map((day, index) => (
                                    <span key={day.day}>{dates.last10[index]}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {!m && <ExpenseCard period={period} />}
            </div>
        </div>
    );
}

function Donut({ parts, size = 220, stroke = 34, center }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; center: React.ReactNode }) {
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offsets = parts.map((_, index) => parts.slice(0, index).reduce((sum, part) => sum + (part.value / total) * c, 0));

    return (
        <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                {parts.map((part, index) => {
                    const length = (part.value / total) * c;
                    return (
                        <circle
                            key={part.color + part.value}
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            stroke={part.color}
                            strokeWidth={stroke}
                            strokeDasharray={`${Math.max(length - 3, 0)} ${c}`}
                            strokeDashoffset={-offsets[index]}
                        />
                    );
                })}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</span>
        </span>
    );
}

function ExpenseCard({ period, extra = 0 }: { period: string; extra?: number }) {
    const items = expenses.map((item, index) => (index === 0 ? { ...item, value: item.value + extra } : item));
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return (
        <div className={`${card} p-6`}>
            <p className="flex items-center gap-2 text-[19px] font-bold text-text-primary">
                <Icon icon="solar:pie-chart-2-linear" className="h-6 w-6 text-accent" />
                ხარჯების განაწილება
            </p>
            <p className="mt-1 text-sm text-text-secondary">{period}</p>
            <div className="mt-4 flex items-center gap-6">
                <Donut
                    parts={items}
                    size={200}
                    center={
                        <>
                            <span className="text-xs text-text-secondary">ჯამური ხარჯი</span>
                            <span className="text-xl font-bold text-text-primary tabular-nums">{money(total)}</span>
                        </>
                    }
                />
                <ul className="min-w-0 flex-1 space-y-3">
                    {items.map(item => (
                        <li key={item.label} className="min-w-0">
                            <span className="flex items-center gap-2 text-sm text-text-secondary">
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: item.color }} />
                                <span className="truncate">{item.label}</span>
                            </span>
                            <span className="ml-5 text-sm font-bold text-text-primary tabular-nums">{money(item.value)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ———————————————————————————— შეკვეთები ————————————————————————————

// შეკვეთების გვერდი ორივე დემოში გამოიყენება, ამიტომ მხოლოდ ამ მდგომარეობას იღებს.
export type OrdersState = {
    total: number;
    processing: number;
    shipped: number;
    newRowIn: number;
    newRowGlow: number;
    status: "processing" | "shipped";
    statusMenu: boolean;
    statusHover: boolean;
    newInvoices: number;
    pressed: (target: string) => boolean;
    near: (target: string) => boolean;
};

type Status = keyof typeof orderStatusStyle;

function StatusChip({ status, m, demo, pressed }: { status: Status; m: boolean; demo?: string; pressed?: boolean }) {
    const style = orderStatusStyle[status];
    return (
        <span
            key={status}
            data-demo={demo}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-transform ${style.className} ${demo ? "demo-pop" : ""} ${pressed ? "scale-95" : ""}`}
        >
            <Icon icon={style.icon} className="h-4 w-4" />
            {!m && style.label}
            {(demo || status === "processing") && <Icon icon="solar:alt-arrow-down-linear" className="h-3.5 w-3.5" />}
        </span>
    );
}

const statusOptions: Status[] = ["processing", "shipped", "completed"];

function StatusMenu({ hover, m }: { hover: boolean; m: boolean }) {
    return (
        <span className={`demo-pop absolute top-full z-30 mt-1 block ${m ? "right-[-3.5rem] w-48" : "left-0 w-52"} overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-[0_18px_40px_-12px_rgb(2_8_23/0.45)]`}>
            {[...statusOptions, "cancelled" as const].map(option => {
                const style = option === "cancelled" ? { label: "გაუქმებული", icon: "solar:close-circle-linear", className: "text-danger" } : orderStatusStyle[option];
                const isHover = option === "shipped" && hover;
                return (
                    <span
                        key={option}
                        data-demo={option === "shipped" ? "status-shipped" : undefined}
                        className={`flex h-11 items-center gap-2 px-3 text-sm font-semibold transition-colors ${
                            isHover ? "bg-accent text-white" : option === "processing" ? "bg-warning/10 text-warning" : "text-text-primary"
                        }`}
                    >
                        <Icon icon={style.icon} className="h-4 w-4" />
                        {style.label}
                    </span>
                );
            })}
        </span>
    );
}

export function OrdersPage({ orders, m, dates }: { orders: OrdersState; m: boolean; dates: DemoDates }) {
    const counters = [
        { label: "სულ შეკვეთები", value: orders.total, icon: "solar:clipboard-list-linear", tone: "bg-accent/10 text-accent", active: true },
        { label: "მუშავდება", value: orders.processing, icon: "solar:clock-circle-linear", tone: "bg-warning/10 text-warning" },
        { label: "გაგზავნილი", value: orders.shipped, icon: "solar:delivery-linear", tone: "bg-accent/10 text-accent" },
        { label: "დასრულებული", value: weekCounts.completed, icon: "solar:check-circle-linear", tone: "bg-success/10 text-success" },
        { label: "გაუქმებული", value: weekCounts.cancelled, icon: "solar:close-circle-linear", tone: "bg-danger/10 text-danger" },
    ];

    const newRow: Row = {
        number: order.number,
        name: `${customer.firstName} ${customer.lastName}`,
        place: `${customer.zone} · ${customer.district}`,
        product: ordered.name,
        count: 1,
        total: orderTotal,
        status: orders.status,
        paid: true,
        icon: ordered.icon,
        tint: ordered.tint,
    };

    const toolbar = [
        { label: "მონიშვნა", icon: "solar:checklist-minimalistic-linear", tone: "text-text-primary" },
        { label: `ახალი ინვოისები (${orders.newInvoices})`, icon: "solar:document-text-linear", tone: "text-success" },
        { label: `ყველა გაგზავნილად (${orders.processing})`, icon: "solar:delivery-linear", tone: "text-accent" },
    ];

    return (
        <div className={`flex flex-col ${m ? "gap-4 p-4" : "gap-6 p-8"}`}>
            <div className={`flex ${m ? "flex-col gap-4" : "items-center justify-between"}`}>
                <PageTitle title="შეკვეთები" m={m} />
                <div className={`flex ${m ? "flex-col gap-3" : "items-center gap-4"}`}>
                    {!m && <PeriodSelect label="ერთი კვირა" m={m} />}
                    <GreenButton className={`h-14 px-7 text-[17px] ${m ? "w-full" : ""}`}>
                        <Icon icon="solar:add-circle-linear" className="h-6 w-6" />
                        ახალი შეკვეთა
                    </GreenButton>
                    {m && <PeriodSelect label="ერთი კვირა" m={m} />}
                </div>
            </div>

            {m ? (
                <div className="space-y-3">
                    <div className={`${card} flex items-center gap-3 border-accent p-4`}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon icon="solar:clipboard-list-linear" className="h-6 w-6" />
                        </span>
                        <span className="text-[15px] text-text-secondary">სულ შეკვეთები</span>
                        <span key={orders.total} className="demo-pop ml-auto text-[24px] font-bold text-text-primary tabular-nums">{orders.total}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {counters.slice(1).map(counter => (
                            <div key={counter.label} className={`${card} p-4`}>
                                <div className="flex items-center justify-between">
                                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${counter.tone}`}>
                                        <Icon icon={counter.icon} className="h-6 w-6" />
                                    </span>
                                    <span key={counter.value} className="demo-pop text-[24px] font-bold text-text-primary tabular-nums">{counter.value}</span>
                                </div>
                                <p className="mt-3 text-[15px] text-text-secondary">{counter.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-5 gap-4">
                    {counters.map(counter => (
                        <div key={counter.label} className={`${card} p-4 ${counter.active ? "border-accent" : ""}`}>
                            <div className="flex items-center justify-between">
                                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${counter.tone}`}>
                                    <Icon icon={counter.icon} className="h-6 w-6" />
                                </span>
                                <span key={counter.value} className="demo-pop text-[28px] font-bold text-text-primary tabular-nums">{counter.value}</span>
                            </div>
                            <p className="mt-3 text-[15px] text-text-secondary">{counter.label}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className={`${card}`}>
                <div className="flex items-center gap-2 p-5">
                    <Icon icon="solar:clipboard-list-linear" className="h-6 w-6 text-accent" />
                    <p className="text-[19px] font-bold text-text-primary">შეკვეთების სია</p>
                    <span className="text-sm text-text-secondary">{orders.total} შეკვეთა</span>
                </div>
                <div className="px-5 pb-4">
                    <span className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-background px-4 text-[15px] font-semibold text-text-primary">
                        <Icon icon="solar:magnifer-linear" className="h-5 w-5 text-accent" />
                        ძებნა და ფილტრები
                        <Icon icon="solar:alt-arrow-down-linear" className="ml-auto h-5 w-5" />
                    </span>
                </div>

                <div className="flex gap-3 overflow-hidden border-t border-border px-5 py-4">
                    {toolbar.map(item => (
                        <span key={item.label} className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-[15px] font-semibold whitespace-nowrap text-text-primary">
                            <Icon icon={item.icon} className={`h-5 w-5 ${item.tone}`} />
                            {item.label}
                        </span>
                    ))}
                </div>

                <div
                    className={`grid border-y border-border bg-background py-3 text-[15px] font-bold text-text-primary ${
                        m ? "grid-cols-[1fr_4.25rem_3.75rem_2.75rem] gap-2 px-4" : "grid-cols-[1.1fr_1.6fr_1.7fr_0.9fr_1.2fr_1fr_3rem] gap-3 px-5"
                    }`}
                >
                    <span>შეკვეთა</span>
                    {!m && <><span>მიმღები</span><span>პროდუქტები</span></>}
                    <span>თანხა</span><span>სტატუსი</span>
                    {!m && <span>გადახდა</span>}
                    <span />
                </div>

                <div>
                    <div data-demo="order-row" className="grid" style={{ gridTemplateRows: `${orders.newRowIn}fr`, opacity: orders.newRowIn }}>
                        <div className={orders.statusMenu ? "min-h-0" : "min-h-0 overflow-hidden"}>
                            <OrderRow row={newRow} m={m} glow={orders.newRowGlow} today={dates.today} orders={orders} isNew />
                        </div>
                    </div>
                    {existingOrders.map(row => (
                        <OrderRow key={row.number} row={row} m={m} today={dates.today} />
                    ))}
                </div>
            </div>
        </div>
    );
}

type Row = {
    number: string;
    name: string;
    place: string;
    product: string;
    count: number;
    total: number;
    status: Status;
    paid: boolean;
    icon: string;
    tint: string;
};

function OrderRow({ row, m, glow = 0, isNew, today, orders }: { row: Row; m: boolean; glow?: number; isNew?: boolean; today: string; orders?: OrdersState }) {
    const glowStyle = glow > 0 ? { backgroundColor: `color-mix(in srgb, var(--marteo-accent) ${Math.round(glow * 10)}%, transparent)` } : undefined;
    const live = isNew && orders;

    const status = (
        <span className="relative">
            <StatusChip status={row.status} m={m} demo={live ? "row-status" : undefined} pressed={live ? orders.pressed("row-status") : false} />
            {live && orders.statusMenu && <StatusMenu hover={orders.statusHover} m={m} />}
        </span>
    );

    const menu = (
        <span
            data-demo={live ? "row-menu" : undefined}
            className={`relative flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-secondary transition-transform ${
                live && orders.pressed("row-menu") ? "scale-90 bg-accent/10 text-accent" : ""
            }`}
        >
            <Icon icon="solar:menu-dots-bold" className="h-5 w-5" />
            {live && orders.newInvoices > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent ring-2 ring-surface" />}
        </span>
    );

    if (m) {
        return (
            <div className="relative grid grid-cols-[1fr_4.25rem_3.75rem_2.75rem] items-center gap-2 border-b border-border px-4 py-3.5" style={glowStyle}>
                {isNew && glow > 0 && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" style={{ opacity: glow }} />}
                <span className="flex min-w-0 items-center gap-2">
                    <ProductThumb icon={row.icon} tint={row.tint} size="h-10 w-10" iconSize="h-6 w-6" />
                    <span className="min-w-0">
                        <span className="block text-[15px] font-bold text-text-primary">{row.number}</span>
                        <span className="block truncate text-sm text-text-secondary">{row.name}</span>
                    </span>
                </span>
                <span className="text-[14px] font-bold text-text-primary tabular-nums">{money(row.total)}</span>
                {status}
                {menu}
            </div>
        );
    }

    return (
        <div className="relative grid grid-cols-[1.1fr_1.6fr_1.7fr_0.9fr_1.2fr_1fr_3rem] items-center gap-3 border-b border-border px-5 py-4" style={glowStyle}>
            {isNew && glow > 0 && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" style={{ opacity: glow }} />}
            <span className="flex items-center gap-3">
                <ProductThumb icon={row.icon} tint={row.tint} />
                <span>
                    <span className="block text-[16px] font-bold text-text-primary">{row.number}</span>
                    <span className="block text-xs text-text-secondary">{today}</span>
                </span>
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[16px] font-bold text-text-primary">{row.name}</span>
                <span className="block truncate text-sm text-text-secondary">{row.place}</span>
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[15px] text-text-primary">{row.product}</span>
                <span className="block text-sm text-text-secondary">{row.count} პროდუქტი</span>
            </span>
            <span className="text-[16px] font-bold text-text-primary tabular-nums">{money(row.total)}</span>
            {status}
            <span className={`text-sm ${row.paid ? "text-text-secondary" : "font-semibold text-warning"}`}>{row.paid ? "გადახდილი" : "გადაუხდელი"}</span>
            {menu}
        </div>
    );
}

// ———————————————————————————— მარაგები ————————————————————————————

const stockStatus = {
    ok: { label: "მარაგშია", className: "bg-success/10 text-success", icon: "solar:check-circle-linear" },
    low: { label: "დაბალი", className: "bg-warning/10 text-warning", icon: "solar:danger-triangle-linear" },
    out: { label: "ამოწურული", className: "bg-danger/10 text-danger", icon: "solar:close-circle-linear" },
};

export function InventoryPage({ frame, m }: PageProps) {
    const cards = [
        { label: "სულ მარაგში", value: `${month.stockKinds} სახეობა`, sub: `(${group(frame.stockUnits)} პროდუქტი)`, icon: "solar:box-linear", tone: "bg-success/10 text-success", active: true, change: true },
        { label: "დაბალი მარაგი", value: "4 სახეობა", sub: "(9 პროდუქტი)", icon: "solar:danger-triangle-linear", tone: "bg-warning/10 text-warning" },
        { label: "ამოწურული მარაგი", value: "2 სახეობა", sub: "(0 პროდუქტი)", icon: "solar:box-minimalistic-linear", tone: "bg-danger/10 text-danger" },
        { label: "წუნდებული მარაგში", value: "1 სახეობა", sub: "(2 პროდუქტი)", icon: "solar:shield-warning-linear", tone: "bg-accent/10 text-accent" },
    ];

    const categories = [
        { label: "სანთლები", value: 214, color: "var(--marteo-success)" },
        { label: "საპონი", value: 126, color: "var(--marteo-accent)" },
        { label: "კერამიკა", value: 88, color: "var(--marteo-warning)" },
        { label: "ქსოვილი", value: 57, color: "var(--marteo-danger)" },
    ];

    return (
        <div className={`flex flex-col ${m ? "gap-4 p-4" : "gap-6 p-8"}`}>
            <div className="flex items-center justify-between gap-3">
                <PageTitle title="მარაგები" m={m} />
                <span className={`flex items-center gap-2 rounded-2xl border border-border bg-surface font-semibold text-text-primary ${m ? "h-12 px-3 text-sm" : "h-14 px-5 text-[16px]"}`}>
                    <Icon icon="solar:printer-linear" className="h-5 w-5 text-accent" />
                    ამობეჭდვა / PDF
                </span>
            </div>

            <div className={`grid ${m ? "grid-cols-2 gap-3" : "grid-cols-4 gap-5"}`}>
                {cards.map(item => (
                    <div key={item.label} className={`${card} ${m ? "p-4" : "p-5"} ${item.active ? "border-success" : ""}`}>
                        <div className="flex items-center gap-3">
                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                                <Icon icon={item.icon} className="h-6 w-6" />
                            </span>
                            <span className="text-[15px] leading-tight text-text-secondary">{item.label}</span>
                        </div>
                        <p className={`mt-3 font-bold text-text-primary ${m ? "text-[20px]" : "text-[26px]"}`}>{item.value}</p>
                        <p className="text-sm text-text-secondary tabular-nums">
                            <span key={item.change ? frame.stockUnits : 0} className={item.change && frame.stockDrop > 0 ? "demo-pop inline-block font-semibold text-warning" : ""}>{item.sub}</span>
                        </p>
                    </div>
                ))}
            </div>

            <div className={`grid gap-5 ${m ? "grid-cols-1" : "grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]"}`}>
                <div className={`${card} overflow-hidden`}>
                    <div className="flex items-center gap-2 p-5">
                        <Icon icon="solar:box-linear" className="h-6 w-6 text-accent" />
                        <p className="text-[19px] font-bold text-text-primary">პროდუქტები</p>
                        <span className="ml-auto text-sm text-text-secondary">{month.stockKinds} სახეობა</span>
                    </div>
                    <div className="px-5 pb-4">
                        <span className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-background px-4 text-[15px] font-semibold text-text-primary">
                            <Icon icon="solar:magnifer-linear" className="h-5 w-5 text-accent" />
                            ძებნა და ფილტრები
                            <Icon icon="solar:alt-arrow-down-linear" className="ml-auto h-5 w-5" />
                        </span>
                    </div>

                    <div className={`grid gap-3 border-y border-border bg-background px-5 py-3 text-sm font-semibold text-text-primary ${m ? "grid-cols-[1fr_4rem_5rem]" : "grid-cols-[2fr_1fr_1fr_1.3fr_5rem_8rem]"}`}>
                        <span>პროდუქტი</span>
                        {!m && <><span>კატეგორია</span><span>SKU</span><span>ფერი / ზომა</span></>}
                        <span className="text-center">მარაგი</span>
                        <span>სტატუსი</span>
                    </div>

                    {products.slice(0, 5).map(product => (
                        <StockRow key={product.id} product={product} frame={frame} m={m} />
                    ))}
                </div>

                {!m && (
                    <div className={`${card} p-5`}>
                        <p className="flex items-center gap-2 text-[19px] font-bold text-text-primary">
                            <Icon icon="solar:pie-chart-2-linear" className="h-6 w-6 text-accent" />
                            მარაგის განაწილება
                        </p>
                        <span className="mt-4 flex h-12 items-center justify-between rounded-xl border border-border bg-background px-4 text-[15px] text-text-primary">
                            კატეგორიების მიხედვით
                            <Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" />
                        </span>
                        <div className="mt-5 flex justify-center">
                            <Donut
                                parts={categories}
                                size={190}
                                stroke={30}
                                center={
                                    <>
                                        <span className="text-[26px] font-bold text-text-primary tabular-nums">{frame.stockUnits}</span>
                                        <span className="text-xs text-text-secondary">პროდუქტი</span>
                                    </>
                                }
                            />
                        </div>
                        <ul className="mt-5 space-y-3">
                            {categories.map(item => (
                                <li key={item.label} className="flex items-center justify-between text-[15px]">
                                    <span className="flex items-center gap-2 text-text-primary">
                                        <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                                        {item.label}
                                    </span>
                                    <span className="font-bold text-text-primary tabular-nums">
                                        {item.label === "სანთლები" ? item.value - (frame.stockDrop > 0 ? 1 : 0) : item.value}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function StockRow({ product, frame, m }: { product: (typeof products)[number]; frame: Frame; m: boolean }) {
    const isTarget = product.id === ordered.id;
    const status = stockStatus[product.status];
    const glow = isTarget ? frame.stockGlow : 0;

    return (
        <div
            data-demo={isTarget ? "stock-row" : undefined}
            className={`relative grid items-center gap-3 border-b border-border px-5 py-3.5 ${m ? "grid-cols-[1fr_4rem_5rem]" : "grid-cols-[2fr_1fr_1fr_1.3fr_5rem_8rem]"}`}
            style={glow > 0 ? { backgroundColor: `color-mix(in srgb, var(--marteo-warning) ${Math.round(glow * 9)}%, transparent)` } : undefined}
        >
            {glow > 0 && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-warning" style={{ opacity: glow }} />}
            <span className="flex min-w-0 items-center gap-3">
                <ProductThumb icon={product.icon} tint={product.tint} />
                <span className="min-w-0">
                    <span className="line-clamp-2 block text-[15px] leading-snug font-bold text-text-primary">{product.name}</span>
                    {!m && <span className="block text-sm text-text-secondary">ხელნაკეთი</span>}
                </span>
            </span>
            {!m && (
                <>
                    <span className="text-sm text-text-secondary">{product.category}</span>
                    <span className="text-sm text-text-secondary tabular-nums">{product.sku}</span>
                    <span className="text-sm text-text-secondary">{product.variant}</span>
                </>
            )}
            <span className="relative flex justify-center text-[17px] font-bold text-text-primary tabular-nums">
                {isTarget ? <StockNumber frame={frame} /> : product.stock}
            </span>
            <span>
                <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${status.className}`}>
                    <Icon icon={status.icon} className="h-4 w-4" />
                    {!m && status.label}
                </span>
            </span>
        </div>
    );
}

// 14 → 13: ძველი ციფრი ზემოთ გადის, ახალი ქვემოდან შემოდის, ზემოთ „−1“ ამოდის.
function StockNumber({ frame }: { frame: Frame }) {
    const d = frame.stockDrop;
    return (
        <span className="relative inline-flex h-7 w-10 justify-center overflow-visible">
            <span className="absolute inset-x-0 overflow-hidden">
                <span className="block text-center" style={{ transform: `translateY(${-d * 100}%)`, opacity: 1 - d }}>
                    {ordered.stock}
                </span>
            </span>
            <span className="absolute inset-x-0 text-center text-warning" style={{ transform: `translateY(${(1 - d) * 100}%)`, opacity: d }}>
                {ordered.stock - 1}
            </span>
            <span
                className="absolute -top-7 left-1/2 rounded-full bg-warning px-2 py-0.5 text-xs font-bold whitespace-nowrap text-white shadow-lg"
                style={{ transform: `translate(-50%, ${(1 - Math.min(d * 2, 1)) * 8}px) scale(${0.6 + Math.min(d * 2, 1) * 0.4})`, opacity: Math.min(d * 3, 1) * (frame.stockGlow > 0 ? 1 : 0) }}
            >
                −1 · {order.number}
            </span>
        </span>
    );
}

// ———————————————————————————— ანალიტიკა ————————————————————————————

export function AnalyticsPage({ frame, m, dates }: PageProps) {
    const period = dates.period;
    const sales = month.sales + ordered.price * frame.sales;
    const cost = month.cost + orderedCost * frame.sales;
    const gross = sales - cost;
    const net = monthProfit + (ordered.price - orderedCost) * frame.profit;

    const cards = [
        { label: "გაყიდვები", value: sales, note: "პროდუქტების გაყიდვები, დაბრუნებების გათვალისწინებით", icon: "solar:cart-large-2-bold-duotone", tone: "bg-accent/10 text-accent", delta: frame.sales > 0 ? `+${money(ordered.price)}` : null, deltaTone: "success" as const },
        { label: "თვითღირებულება", value: cost, note: "გაყიდულ ნივთებზე აღრიცხული თვითღირებულება", icon: "solar:box-bold-duotone", tone: "bg-warning/10 text-warning", delta: frame.sales > 0 ? `+${money(orderedCost)}` : null, deltaTone: "warning" as const },
        { label: "მთლიანი მოგება", value: gross, note: "გაყიდვები − თვითღირებულება", icon: "solar:chart-square-bold-duotone", tone: "bg-accent/10 text-accent", delta: null, deltaTone: "success" as const },
        { label: "სხვა ხარჯები", value: month.other, note: "ცალკე აღრიცხული ხარჯები", icon: "solar:bill-list-bold-duotone", tone: "bg-danger/10 text-danger", delta: null, deltaTone: "success" as const },
        { label: "სუფთა მოგება", value: net, note: "გაყიდვები − თვითღირებულება − სხვა ხარჯები", icon: "solar:chart-2-bold-duotone", tone: "bg-success/10 text-success", delta: frame.profit > 0 ? `+${money(ordered.price - orderedCost)}` : null, deltaTone: "success" as const, profit: true },
    ];

    const max = 600;

    return (
        <div className={`flex flex-col ${m ? "gap-4 p-4" : "gap-6 p-8"}`}>
            <div className={`flex ${m ? "flex-col gap-4" : "items-center justify-between"}`}>
                <PageTitle title="ანალიტიკა" m={m} />
                <div className={`flex ${m ? "flex-col gap-3" : "items-center gap-4"}`}>
                    {!m && <PeriodSelect label="ერთი თვე" m={m} className="!w-[240px]" />}
                    <span className="flex gap-3">
                        <span className="flex h-14 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-[16px] font-semibold text-text-primary">
                            <Icon icon="solar:document-text-linear" className="h-5 w-5 text-accent" />
                            ბიზნესის ანგარიში
                        </span>
                        <GreenButton className="h-14 px-5 text-[16px]">
                            <Icon icon="solar:add-circle-linear" className="h-6 w-6" />
                            ხარჯის დამატება
                        </GreenButton>
                    </span>
                </div>
            </div>

            <p className="-mt-2 text-sm text-text-secondary">პერიოდი: {period}</p>

            <div data-demo="cards-row" className={`grid ${m ? "grid-cols-2 gap-3" : "grid-cols-5 gap-4"}`}>
                {cards.map(item => (
                    <div
                        key={item.label}
                        data-demo={item.profit ? "profit-card" : undefined}
                        className={`${card} relative min-w-0 p-5 transition-[border-color,box-shadow] duration-500 ${item.profit && frame.profit > 0 ? "border-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--marteo-success)_15%,transparent)]" : ""}`}
                    >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                            <Icon icon={item.icon} className="h-6 w-6" />
                        </span>
                        <p className="mt-3 truncate text-[15px] font-medium text-text-secondary">{item.label}</p>
                        <p className={`mt-1 font-bold text-text-primary tabular-nums ${m ? "text-[21px]" : "text-[24px]"}`}>{money(item.value)}</p>
                        <span className="mt-1 flex h-6 items-center">
                            <Delta show={item.delta !== null} tone={item.deltaTone}>{item.delta ?? "+0"}</Delta>
                        </span>
                        <p className="mt-1 text-[13px] leading-snug text-text-secondary">{item.note}</p>
                    </div>
                ))}
            </div>

            <div className={`grid gap-5 ${m ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className={`${card} p-6`}>
                    <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-[19px] font-bold text-text-primary">
                            <Icon icon="solar:chart-square-linear" className="h-6 w-6 text-accent" />
                            ფინანსები
                        </p>
                        <span className={`gap-2 ${m ? "hidden" : "flex"}`}>
                            <span className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-text-primary">7 დღე<Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" /></span>
                            <span className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-text-primary">გაყიდვები<Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" /></span>
                        </span>
                    </div>
                    <div className="mt-6 flex h-[200px] items-end justify-around gap-3 border-b border-border pb-1">
                        {analyticsWeek.map((day, index) => {
                            const last = index === analyticsWeek.length - 1;
                            const value = day.sales + (last ? ordered.price * frame.sales : 0);
                            return (
                                <span key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                                    {last && <span className="text-xs font-bold text-success tabular-nums" style={{ opacity: frame.sales }}>{money(value, false)}</span>}
                                    <span className={`w-full max-w-10 rounded-t-lg ${last ? "bg-success" : "bg-accent/70"}`} style={{ height: `${(value / max) * 80}%` }} />
                                </span>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex justify-around text-xs text-text-secondary">
                        {analyticsWeek.map((day, index) => <span key={day.day} className="flex-1 text-center">{dates.last7[index]}</span>)}
                    </div>
                </div>
                {!m && <ExpenseCard period={period} extra={orderedCost * frame.sales} />}
            </div>
        </div>
    );
}
