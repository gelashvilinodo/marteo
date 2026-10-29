"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";

import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";

// ფუნქციების bento ბადე. გადამრთველი ბიზნესის ტიპს ირჩევს: იმპორტზე ჩანს
// „შესყიდვები", წარმოებაზე „წარმოება", ორივეზე — ორივე ბარათი. ბარათის
// დამატება/მოცილება ნაზად ხდება (სიგანე ან სიმაღლე იზრდება), ბადე არ ხტება.

export default function FeaturesBento() {
    const [mode, setMode] = useState<BusinessMode>("HYBRID");

    const showPurchases = mode !== "MANUFACTURING";
    const showProduction = mode !== "IMPORT";
    const columns = 1 + Number(showPurchases) + Number(showProduction);

    return (
        <section
            aria-labelledby="features-bento-title"
            className="relative border-t border-border bg-background py-16 sm:py-24"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <h2
                        id="features-bento-title"
                        className="text-[clamp(1.15rem,5.5vw,3rem)] leading-tight font-bold whitespace-nowrap text-text-primary"
                    >
                        შენი ბიზნესი ერთ ეკრანზე.
                    </h2>

                    <ModeSwitch mode={mode} onChange={setMode} />
                </div>

                <div className="mt-8 flex flex-col gap-4 sm:mt-10">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <BentoCard
                            index={0}
                            icon="solar:clipboard-list-bold-duotone"
                            tone="bg-accent/10 text-accent"
                            title="შეკვეთები"
                            text="ყველა შეკვეთა და სტატუსი ერთ სიაში."
                        >
                            {active => <OrdersVisual active={active} />}
                        </BentoCard>

                        <BentoCard
                            index={1}
                            icon="solar:graph-up-bold-duotone"
                            tone="bg-success/10 text-success"
                            title="ფინანსები"
                            text="იცი, რამდენს გამოიმუშავებ სინამდვილეში."
                        >
                            {active => <FinanceVisual active={active} />}
                        </BentoCard>
                    </div>

                    <div className="bento-row">
                        <Slot shown fraction={1 / columns}>
                            <BentoCard
                                index={2}
                                icon="solar:box-bold-duotone"
                                tone="bg-warning/10 text-warning"
                                title="მარაგები"
                                text="დაბალ მარაგზე ავტომატური გაფრთხილება."
                            >
                                {active => <StockVisual active={active} />}
                            </BentoCard>
                        </Slot>

                        <Slot shown={showPurchases} fraction={1 / (columns + (showPurchases ? 0 : 1))}>
                            <BentoCard
                                index={3}
                                icon="solar:cart-large-2-bold-duotone"
                                tone="bg-accent/10 text-accent"
                                title="შესყიდვები"
                                text="ყოველი შეძენა მარაგს თავად ემატება."
                            >
                                {active => <PurchasesVisual active={active} />}
                            </BentoCard>
                        </Slot>

                        <Slot shown={showProduction} fraction={1 / (columns + (showProduction ? 0 : 1))}>
                            <BentoCard
                                index={4}
                                icon="solar:structure-bold-duotone"
                                tone="bg-success/10 text-success"
                                title="წარმოება"
                                text="მასალებიდან მზა პროდუქტამდე, ზუსტი ხარჯით."
                            >
                                {active => <ProductionVisual active={active} />}
                            </BentoCard>
                        </Slot>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <BentoCard
                            index={5}
                            icon="solar:users-group-rounded-bold-duotone"
                            tone="bg-accent/10 text-accent"
                            title="სტატისტიკა"
                            text="ვინ ყიდულობს, რამდენს და როგორ იხდის."
                        >
                            {active => <StatisticsVisual active={active} />}
                        </BentoCard>

                        <BentoCard
                            index={6}
                            icon="solar:document-text-bold-duotone"
                            tone="bg-text-primary/10 text-text-primary"
                            title="დოკუმენტები"
                            text="ინვოისი QR კოდით და რეპორტი ბუღალტრისთვის."
                        >
                            {active => <DocumentsVisual active={active} />}
                        </BentoCard>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ModeSwitch({
    mode,
    onChange,
}: {
    mode: BusinessMode;
    onChange: (mode: BusinessMode) => void;
}) {
    const index = BUSINESS_MODES.findIndex(item => item.value === mode);

    return (
        <div
            role="radiogroup"
            aria-label="ბიზნესის ტიპი"
            className="relative grid w-full grid-cols-3 rounded-2xl border border-border bg-surface p-1 md:w-auto"
        >
            <span
                aria-hidden="true"
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-accent shadow-md shadow-accent/25 transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${index * 100}%)` }}
            />

            {BUSINESS_MODES.map(item => {
                const selected = item.value === mode;

                return (
                    <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(item.value)}
                        className={`relative z-10 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-300 md:px-5 ${
                            selected ? "text-white" : "text-text-secondary hover:text-text-primary"
                        }`}
                    >
                        <Icon icon={item.icon} className="h-5 w-5 shrink-0" />
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

// შესყიდვების/წარმოების სლოტი: ტელეფონსა და პლანშეტზე გაზომილი სიმაღლით,
// lg-დან სიგანით ნაზად იხსნება და იკეცება. ბარათს თავიდანვე საბოლოო
// სიგანე აქვს, ამიტომ ანიმაციისას არ გადაეწყობა. შეკვეცა მხოლოდ
// ანიმაციის დროსაა ჩართული, რომ ჰოვერზე ამოწეული ბარათი არ მოიჭრას.
function Slot({
    shown,
    fraction,
    children,
}: {
    shown: boolean;
    fraction: number;
    children: ReactNode;
}) {
    const innerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);
    const state = `${shown}-${fraction}`;
    const [settledState, setSettledState] = useState(state);

    useEffect(() => {
        const inner = innerRef.current;
        if (!inner) return;

        const observer = new ResizeObserver(() => setHeight(inner.offsetHeight));
        observer.observe(inner);

        return () => observer.disconnect();
    }, []);

    // transitionend-ის სათადარიგო: შემცირებული მოძრაობისას ანიმაცია არ არის.
    useEffect(() => {
        const timer = setTimeout(() => setSettledState(state), 600);
        return () => clearTimeout(timer);
    }, [state]);

    return (
        <div
            className="bento-slot"
            data-shown={shown}
            data-settled={settledState === state}
            aria-hidden={!shown}
            onTransitionEnd={event => {
                if (
                    event.target === event.currentTarget &&
                    (event.propertyName === "width" || event.propertyName === "height")
                ) {
                    setSettledState(state);
                }
            }}
            style={{
                ["--slot-f" as string]: fraction,
                ...(height ? { ["--slot-h" as string]: `calc(${height}px + 1rem)` } : {}),
            }}
        >
            <div ref={innerRef} className="bento-slot-inner" inert={!shown}>
                {children}
            </div>
        </div>
    );
}

// ბარათი: ეკრანზე შემოსვლისას რბილად ჩნდება. მაუსით ჰოვერზე ცოცხლდება,
// სენსორულ ეკრანზე — როცა ეკრანზეა.
function BentoCard({
    index,
    icon,
    tone,
    title,
    text,
    children,
}: {
    index: number;
    icon: string;
    tone: string;
    title: string;
    text: string;
    children: (active: boolean) => ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    const [revealed, setRevealed] = useState(false);
    const [inView, setInView] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [canHover, setCanHover] = useState(true);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const hover = window.matchMedia("(hover: hover)");
        setCanHover(hover.matches);

        const observer = new IntersectionObserver(
            ([entry]) => {
                setInView(entry.isIntersecting && entry.intersectionRatio >= 0.55);
                if (entry.isIntersecting) setRevealed(true);
            },
            { threshold: [0, 0.55] },
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    const active = canHover ? hovered : inView;

    return (
        <article
            ref={ref}
            onPointerEnter={event => event.pointerType === "mouse" && setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            className={`bento-card group flex h-full min-w-0 flex-col rounded-3xl border bg-surface p-5 transition-[border-color,box-shadow,translate,opacity,transform] duration-500 sm:p-6 ${
                active ? "-translate-y-1 border-accent/30 shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)]" : "border-border"
            }`}
            data-revealed={revealed}
            style={{ transitionDelay: revealed ? undefined : `${index * 70}ms` }}
        >
            <div className="flex items-start gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                    <Icon icon={icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">{text}</p>
                </div>
            </div>

            <div aria-hidden="true" className="mt-5 flex min-h-0 flex-1 flex-col justify-end select-none">
                {children(active)}
            </div>
        </article>
    );
}

/* ---------- ბარათების მინი-ვიზუალები ---------- */

const statusTones = {
    processing: { label: "მუშავდება", className: "bg-warning/10 text-warning", icon: "solar:clock-circle-linear" },
    shipped: { label: "გაგზავნილი", className: "bg-accent/10 text-accent", icon: "solar:delivery-linear" },
    done: { label: "დასრულებული", className: "bg-success/10 text-success", icon: "solar:check-circle-linear" },
} as const;

function Pill({ status }: { status: keyof typeof statusTones }) {
    const item = statusTones[status];

    return (
        <span
            key={status}
            className={`order-flow-pop inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium whitespace-nowrap ${item.className}`}
        >
            <Icon icon={item.icon} className="h-3.5 w-3.5" />
            {item.label}
        </span>
    );
}

function OrdersVisual({ active }: { active: boolean }) {
    const counters = [
        { label: "მუშავდება", value: active ? 11 : 12, tone: "text-warning" },
        { label: "გაგზავნილი", value: active ? 10 : 9, tone: "text-accent" },
        { label: "დასრულებული", value: 127, tone: "text-success" },
    ];

    const rows = [
        { number: "#0149", name: "ნინო ბერიძე", total: "72 ₾", status: active ? "shipped" : "processing" },
        { number: "#0148", name: "გიორგი კაპანაძე", total: "142 ₾", status: "shipped" },
        { number: "#0147", name: "მარიამ ლომიძე", total: "58 ₾", status: "done" },
    ] as const;

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
                {counters.map(counter => (
                    <div key={counter.label} className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="truncate text-[11px] text-text-secondary">{counter.label}</p>
                        <p key={counter.value} className={`order-flow-pop text-lg font-bold tabular-nums ${counter.tone}`}>
                            {counter.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-background">
                {rows.map((row, index) => (
                    <div
                        key={row.number}
                        className={`grid grid-cols-[3.25rem_minmax(0,1fr)_auto_3rem] items-center gap-2 px-3 py-2.5 text-xs transition-colors duration-500 ${
                            index > 0 ? "border-t border-border" : ""
                        } ${index === 0 && active ? "bg-accent/5" : ""}`}
                    >
                        <span className="font-semibold text-text-primary tabular-nums">{row.number}</span>
                        <span className="truncate text-text-primary">{row.name}</span>
                        <Pill status={row.status} />
                        <span className="text-right font-semibold text-text-primary tabular-nums">{row.total}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// 10 დღის მოგების მრუდი; ბოლო წერტილი აქტიურობისას ემატება.
const profitPoints = [190, 240, 170, 290, 260, 320, 210, 360, 280, 385];

function FinanceVisual({ active }: { active: boolean }) {
    const width = 300;
    const height = 90;
    const step = width / (profitPoints.length - 1);
    const y = (value: number) => height - (value / 420) * height;
    const line = profitPoints.map((value, index) => `${index ? "L" : "M"} ${index * step} ${y(value)}`).join(" ");
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <p className="text-xs text-text-secondary">სუფთა მოგება</p>
                    <p key={active ? "after" : "before"} className="order-flow-pop text-3xl font-bold text-text-primary tabular-nums">
                        {active ? "2 742 ₾" : "2 705 ₾"}
                    </p>
                </div>
                <span
                    className={`rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success transition-all duration-300 ${
                        active ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    }`}
                >
                    +37 ₾
                </span>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full overflow-visible" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="bento-profit-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--marteo-success)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="var(--marteo-success)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={area} fill="url(#bento-profit-fill)" />
                <path
                    d={line}
                    fill="none"
                    stroke="var(--marteo-success)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    strokeDasharray="1"
                    strokeDashoffset={active ? 0 : 0.1}
                    className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
                <circle
                    cx={width}
                    cy={y(profitPoints[profitPoints.length - 1])}
                    r={active ? 4 : 0}
                    fill="var(--marteo-success)"
                    className="transition-[r] delay-500 duration-300"
                />
            </svg>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        გაყიდვები
                    </span>
                    <span className="font-semibold text-text-primary tabular-nums">{active ? "7 185 ₾" : "7 120 ₾"}</span>
                </span>
                <span className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                        <span className="h-2 w-2 rounded-full bg-warning" />
                        ხარჯები
                    </span>
                    <span className="font-semibold text-text-primary tabular-nums">{active ? "4 443 ₾" : "4 415 ₾"}</span>
                </span>
            </div>
        </div>
    );
}

function StockVisual({ active }: { active: boolean }) {
    const items = [
        { name: "ტყავის საფულე", stock: 17, max: 30, icon: "solar:wallet-bold-duotone" },
        { name: "სუნამო 50 მლ", stock: active ? 3 : 6, max: 30, icon: "solar:bottle-bold-duotone", low: active },
    ];

    return (
        <div className="flex flex-col gap-2">
            {items.map(item => (
                <div
                    key={item.name}
                    className={`rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
                        item.low ? "border-warning/40 bg-warning/5" : "border-border bg-background"
                    }`}
                >
                    <div className="flex items-center gap-2.5">
                        <Icon icon={item.icon} className="h-5 w-5 shrink-0 text-warning" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">{item.name}</span>
                        <span key={item.stock} className="order-flow-pop text-sm font-bold text-text-primary tabular-nums">
                            {item.stock}
                        </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60">
                        <span
                            className={`block h-full rounded-full transition-[width] duration-700 ${item.low ? "bg-danger" : "bg-warning"}`}
                            style={{ width: `${(item.stock / item.max) * 100}%` }}
                        />
                    </div>
                </div>
            ))}

            <div
                className={`flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs font-medium text-warning transition-all duration-500 ${
                    active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
            >
                <Icon icon="solar:bell-bing-bold-duotone" className={`h-4 w-4 shrink-0 ${active ? "bento-ring" : ""}`} />
                <span className="truncate">დაბალი მარაგი: სუნამო 50 მლ</span>
            </div>
        </div>
    );
}

function PurchasesVisual({ active }: { active: boolean }) {
    return (
        <div className="flex flex-col gap-2">
            <div
                className="grid transition-[grid-template-rows,opacity] duration-500"
                style={{ gridTemplateRows: active ? "1fr" : "0fr", opacity: active ? 1 : 0 }}
            >
                <div className="min-h-0 overflow-hidden">
                    <PurchaseRow date="28.10" name="ტყავის საფულე" amount="+20" cost="28 ₾ / ერთ." highlight />
                </div>
            </div>
            <PurchaseRow date="21.10" name="კერამიკული ფინჯანი" amount="+15" cost="14 ₾ / ერთ." />
            <PurchaseRow date="12.10" name="ბამბის ჩანთა" amount="+30" cost="11 ₾ / ერთ." />

            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-xs">
                <span className="text-text-secondary">ტყავის საფულე მარაგში</span>
                <span key={active ? "after" : "before"} className="order-flow-pop font-bold text-text-primary tabular-nums">
                    {active ? "17 → 37" : "17"}
                </span>
            </div>
        </div>
    );
}

function PurchaseRow({
    date,
    name,
    amount,
    cost,
    highlight = false,
}: {
    date: string;
    name: string;
    amount: string;
    cost: string;
    highlight?: boolean;
}) {
    return (
        <div
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
                highlight ? "border-accent/30 bg-accent/5" : "border-border bg-background"
            }`}
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <Icon icon="solar:arrow-down-linear" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-text-primary">{name}</span>
                <span className="block text-[11px] text-text-secondary tabular-nums">
                    {date} · {cost}
                </span>
            </span>
            <span className="text-sm font-semibold text-success tabular-nums">{amount}</span>
        </div>
    );
}

function ProductionVisual({ active }: { active: boolean }) {
    const materials = [
        { name: "ტყავი", amount: "0.4 მ²" },
        { name: "ძაფი", amount: "3 მ" },
        { name: "საკინძი", amount: "1 ც." },
    ];

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
                {materials.map((material, index) => (
                    <span
                        key={material.name}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-all duration-500 ${
                            active ? "border-success/40 bg-success/5 text-text-primary" : "border-border bg-background text-text-secondary"
                        }`}
                        style={{ transitionDelay: active ? `${index * 90}ms` : "0ms" }}
                    >
                        <Icon icon="solar:layers-minimalistic-bold-duotone" className="h-3.5 w-3.5 text-success" />
                        {material.name} · {material.amount}
                    </span>
                ))}
            </div>

            <div className="relative mx-auto h-6 w-px overflow-hidden bg-border">
                <span
                    className="absolute inset-x-0 top-0 bg-success transition-[height] duration-500"
                    style={{ height: active ? "100%" : "0%", transitionDelay: active ? "250ms" : "0ms" }}
                />
            </div>

            <div
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                    active ? "border-success/40 bg-success/5" : "border-border bg-background"
                }`}
                style={{ transitionDelay: active ? "450ms" : "0ms" }}
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                    <Icon icon="solar:wallet-bold-duotone" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-text-primary">ტყავის საფულე</span>
                    <span className="block text-[11px] text-text-secondary">თვითღირებულება 26 ₾</span>
                </span>
                <span key={active ? "made" : "plan"} className="order-flow-pop text-sm font-bold text-success tabular-nums">
                    {active ? "+10" : "×10"}
                </span>
            </div>
        </div>
    );
}

function StatisticsVisual({ active }: { active: boolean }) {
    const weeks = [
        { fresh: 6, repeat: 9 },
        { fresh: 8, repeat: 11 },
        { fresh: 5, repeat: 13 },
        { fresh: 9, repeat: 14 },
        { fresh: 7, repeat: 17 },
    ];
    const payments = [
        { label: "ბარათი", value: 58, color: "bg-accent" },
        { label: "გადარიცხვა", value: 27, color: "bg-success" },
        { label: "ნაღდი", value: 15, color: "bg-warning" },
    ];

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-3 text-[11px] text-text-secondary">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent/40" />ახალი</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />განმეორებითი</span>
                </div>
                <div className="mt-3 flex h-20 items-end justify-between gap-2">
                    {weeks.map((week, index) => (
                        <span key={index} className="flex h-full flex-1 flex-col justify-end gap-0.5">
                            <span
                                className="block rounded-t-md bg-accent/40 transition-[height] duration-700"
                                style={{ height: `${(week.fresh / 32) * (active ? 100 : 60)}%`, transitionDelay: `${index * 60}ms` }}
                            />
                            <span
                                className="block rounded-b-sm bg-accent transition-[height] duration-700"
                                style={{ height: `${(week.repeat / 32) * (active ? 100 : 60)}%`, transitionDelay: `${index * 60}ms` }}
                            />
                        </span>
                    ))}
                </div>
            </div>

            <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-background p-3">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-border/60">
                    {payments.map(payment => (
                        <span
                            key={payment.label}
                            className={`h-full transition-[width] duration-700 ${payment.color}`}
                            style={{ width: active ? `${payment.value}%` : `${100 / payments.length}%` }}
                        />
                    ))}
                </div>
                {payments.map(payment => (
                    <span key={payment.label} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                            <span className={`h-2 w-2 rounded-full ${payment.color}`} />
                            {payment.label}
                        </span>
                        <span className="font-semibold text-text-primary tabular-nums">{payment.value}%</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function DocumentsVisual({ active }: { active: boolean }) {
    return (
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="relative h-36">
                <div
                    className={`absolute inset-x-6 top-2 bottom-0 rounded-xl border border-border bg-background transition-transform duration-500 ${
                        active ? "translate-x-3 rotate-3" : ""
                    }`}
                />
                <div
                    className={`absolute inset-x-2 top-0 bottom-2 flex flex-col rounded-xl border border-border bg-surface p-3 shadow-md transition-transform duration-500 ${
                        active ? "-translate-x-1 -translate-y-1.5 -rotate-2" : ""
                    }`}
                >
                    <div className="flex items-start justify-between">
                        <span>
                            <span className="block text-[11px] font-semibold text-text-primary">ინვოისი #0149</span>
                            <span className="block text-[10px] text-text-secondary">ნინო ბერიძე</span>
                        </span>
                        <Icon icon="solar:qr-code-linear" className="h-8 w-8 text-text-primary" />
                    </div>
                    <div className="mt-2 space-y-1.5">
                        <span className="block h-1.5 w-4/5 rounded-full bg-border" />
                        <span className="block h-1.5 w-3/5 rounded-full bg-border" />
                        <span className="block h-1.5 w-2/3 rounded-full bg-border" />
                    </div>
                    <div className="mt-auto flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">სულ</span>
                        <span className="font-bold text-text-primary">72 ₾</span>
                    </div>
                    <span
                        className={`absolute -top-2 -right-2 rounded-lg bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white shadow transition-all duration-300 ${
                            active ? "scale-100 opacity-100" : "scale-75 opacity-0"
                        }`}
                    >
                        PDF
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {[
                    { label: "ბუღალტრის რეპორტი", icon: "solar:document-text-linear" },
                    { label: "მარაგის აღწერა", icon: "solar:clipboard-list-linear" },
                    { label: "ინვოისების ბეჭდვა", icon: "solar:printer-minimalistic-bold-duotone" },
                ].map((item, index) => (
                    <span
                        key={item.label}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all duration-500 ${
                            active ? "translate-x-0 border-accent/30 text-text-primary" : "border-border text-text-secondary"
                        } bg-background`}
                        style={{ transitionDelay: active ? `${index * 90}ms` : "0ms" }}
                    >
                        <Icon icon={item.icon} className="h-4 w-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <Icon
                            icon="solar:download-linear"
                            className={`h-4 w-4 shrink-0 text-accent transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                        />
                    </span>
                ))}
            </div>
        </div>
    );
}
