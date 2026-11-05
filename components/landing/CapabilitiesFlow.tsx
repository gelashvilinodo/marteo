"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";

import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";

// შესაძლებლობების ციკლი: ყოველ ნაბიჯს პატარა ინტერფეისის სცენა აქვს და
// მხოლოდ ერთი მოკლე ხაზი. გადამრთველი ბიზნესის ტიპს ირჩევს: იმპორტზე
// წარმოების ნაბიჯი ქრება და ნომრები თავიდან ითვლება.
//
// „ერთი შეკვეთის გზა": ბადე ეკრანზე რომ გამოჩნდება, ერთი შეკვეთა ბარათებს
// რიგრიგობით გაივლის (მარაგი −1, გაგზავნა, SMS, მოგება). ტელეფონზე ბარათები
// ერთმანეთის ქვეშაა, ამიტომ იქ თითო ბარათი მაშინ იცვლება, როცა თავად ჩანს.
// შემცირებული მოძრაობისას საბოლოო მდგომარეობა მაშინვე ჩანს.

// შეკვეთის გზის ეტაპები: ყოველი ეტაპი ერთ ბარათს ცვლის.
type Change = "stock" | "shipped" | "onTheWay" | "delivered" | "profit";

const journey: { card: string; change?: Change }[] = [
    { card: "orders" },
    { card: "stock", change: "stock" },
    { card: "orders", change: "shipped" },
    { card: "customers", change: "onTheWay" },
    { card: "customers", change: "delivered" },
    { card: "money", change: "profit" },
];

const JOURNEY_STEP_MS = 1100;

// ტელეფონზე: რომელ ცვლილებებს იწვევს ბარათის ეკრანზე გამოჩენა, გვერდის რიგით.
// სწრაფი სქროლი ბარათს შეიძლება გამოტოვოს, ამიტომ ქვედა ბარათი ზედებსაც ასრულებს.
const changesOnView: { card: string; changes: Change[] }[] = [
    { card: "stock", changes: ["stock"] },
    { card: "orders", changes: ["shipped"] },
    { card: "customers", changes: ["onTheWay", "delivered"] },
    { card: "money", changes: ["profit"] },
];

const allChanges: Change[] = ["stock", "shipped", "onTheWay", "delivered", "profit"];

type Done = ReadonlySet<Change>;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

type Step = {
    id: string;
    icon: string;
    title: string;
    text: string;
    visual: (mode: BusinessMode, done: Done) => ReactNode;
    center?: boolean;
    hidden?: (mode: BusinessMode) => boolean;
};

const steps: Step[] = [
    {
        id: "start",
        icon: "solar:rocket-2-bold-duotone",
        title: "დაწყება",
        text: "ძველი ექსელი ერთ წუთში გადმოდის.",
        visual: () => <StartVisual />,
    },
    {
        id: "purchases",
        icon: "solar:cart-large-2-bold-duotone",
        title: "შესყიდვა",
        text: "AI მომწოდებლის ფაილს თავად კითხულობს.",
        visual: mode => <PurchaseVisual mode={mode} />,
    },
    {
        id: "production",
        icon: "solar:structure-bold-duotone",
        title: "წარმოება",
        text: "მასალებიდან პროდუქტამდე, ზუსტი ხარჯით.",
        visual: () => <ProductionVisual />,
        hidden: mode => mode === "IMPORT",
    },
    {
        id: "stock",
        icon: "solar:box-bold-duotone",
        title: "მარაგი",
        text: "თავად ითვლის და დროზე გაგაფრთხილებთ.",
        visual: (_, done) => <StockVisual sold={done.has("stock")} />,
    },
    {
        id: "orders",
        icon: "solar:clipboard-list-bold-duotone",
        title: "შეკვეთა",
        text: "ერთი დაჭერით, ინვოისით და სტატუსით.",
        visual: (_, done) => <OrderVisual shipped={done.has("shipped")} />,
        center: true,
    },
    {
        id: "customers",
        icon: "solar:users-group-rounded-bold-duotone",
        title: "მომხმარებელი",
        text: "SMS და პირადი ბმული შეკვეთის სტატუსით.",
        visual: (_, done) => <CustomerVisual stage={done.has("delivered") ? 2 : done.has("onTheWay") ? 1 : 0} />,
    },
    {
        id: "money",
        icon: "solar:wallet-money-bold-duotone",
        title: "ფული",
        text: "ხედავთ მოგებას, არა მხოლოდ შემოსავალს.",
        visual: (_, done) => <MoneyVisual earned={done.has("profit")} />,
    },
    {
        id: "growth",
        icon: "solar:graph-up-bold-duotone",
        title: "ზრდა",
        text: "ციფრები და AI რჩევა შემდეგ პარტიაზე.",
        visual: () => <GrowthVisual />,
    },
];

const extras = [
    { icon: "solar:smartphone-2-bold-duotone", label: "ტელეფონზე, აპლიკაციასავით" },
    { icon: "solar:users-group-two-rounded-bold-duotone", label: "გუნდი და როლები" },
    { icon: "solar:bell-bold-duotone", label: "შეტყობინებები" },
    { icon: "solar:chat-round-dots-bold-duotone", label: "მხარდაჭერის ჩატი" },
];

export default function CapabilitiesFlow() {
    const [mode, setMode] = useState<BusinessMode>("HYBRID");
    const [done, setDone] = useState<Done>(() => new Set());
    const [activeCard, setActiveCard] = useState<string | null>(null);
    const listRef = useRef<HTMLOListElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
    const shown: Done = reducedMotion ? new Set(allChanges) : done;
    const visible = steps.filter(step => !step.hidden?.(mode));

    const clearTimers = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    };

    const later = (ms: number, run: () => void) => {
        timers.current.push(setTimeout(run, ms));
    };

    const playJourney = useCallback(() => {
        clearTimers();
        setDone(new Set());
        journey.forEach((stage, index) => later(index * JOURNEY_STEP_MS, () => {
            setActiveCard(stage.card);
            if (stage.change) setDone(previous => new Set(previous).add(stage.change!));
        }));
        later(journey.length * JOURNEY_STEP_MS, () => setActiveCard(null));
    }, []);

    useEffect(() => {
        const list = listRef.current;
        if (!list || reducedMotion) return;

        let observer: IntersectionObserver;

        if (window.matchMedia("(min-width: 640px)").matches) {
            // ბადე ერთიანად ჩანს: გზა ერთხელ თავისით ირთვება.
            observer = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                observer.disconnect();
                playJourney();
            }, { threshold: 0.35 });
            observer.observe(list);
        } else {
            // ტელეფონი: ბარათი თავის ცვლილებას მაშინ აჩვენებს, როცა ეკრანზეა.
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    observer.unobserve(entry.target);
                    const position = changesOnView.findIndex(item => item.card === (entry.target as HTMLElement).dataset.step);
                    if (position < 0) continue;
                    const skipped = changesOnView.slice(0, position).flatMap(item => item.changes);
                    setDone(previous => new Set([...previous, ...skipped]));
                    changesOnView[position].changes.forEach((change, index) => later(400 + index * JOURNEY_STEP_MS, () => {
                        setDone(previous => new Set(previous).add(change));
                    }));
                }
            }, { threshold: 0.6 });
            list.querySelectorAll("[data-step]").forEach(card => observer.observe(card));
        }

        return () => {
            observer.disconnect();
            clearTimers();
        };
    }, [playJourney, reducedMotion]);

    return (
        <section aria-label="მართეოს შესაძლებლობები" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
                <ModeSwitch mode={mode} onChange={setMode} />
                {!reducedMotion && <button
                    type="button"
                    onClick={playJourney}
                    className="hidden h-[3.25rem] cursor-pointer items-center gap-2 rounded-2xl border border-border bg-surface px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent/50 hover:text-accent sm:inline-flex"
                >
                    <Icon icon="solar:play-circle-bold-duotone" className="h-5 w-5 text-accent" aria-hidden="true" />
                    ნახეთ ერთი შეკვეთის გზა
                </button>}
            </div>

            <ol ref={listRef} className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4">
                {visible.map((step, index) => (
                    <li key={step.id} className="min-w-0">
                        <article
                            data-step={step.id}
                            className={`flex h-full flex-col rounded-3xl border bg-surface p-4 transition-[border-color,box-shadow,translate] duration-500 sm:p-5 ${
                                activeCard === step.id
                                    ? "-translate-y-1 border-accent shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.45)]"
                                    : step.center ? "border-accent/50 shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)]" : "border-border"
                            }`}
                        >
                            <div
                                aria-hidden="true"
                                className="flex h-44 flex-col justify-center gap-2 overflow-hidden rounded-2xl border border-border bg-background p-3 text-xs text-text-primary select-none"
                            >
                                {step.visual(mode, shown)}
                            </div>

                            <div className="mt-4 flex items-start gap-3">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent tabular-nums">
                                    {index + 1}
                                </span>
                                <div className="min-w-0">
                                    <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                                        <Icon icon={step.icon} className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                                        {step.title}
                                    </h2>
                                    <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">{step.text}</p>
                                </div>
                            </div>
                        </article>
                    </li>
                ))}
            </ol>

            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-text-secondary">
                <Icon icon="solar:refresh-circle-linear" className="h-5 w-5 text-accent" aria-hidden="true" />
                ციკლი თავიდან იწყება: შემდეგი შესყიდვა უკვე ციფრებით.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-6">
                <p className="text-sm font-semibold text-text-primary">ყოველთვის თქვენთანაა</p>
                <ul className="flex flex-wrap justify-center gap-2">
                    {extras.map(extra => (
                        <li
                            key={extra.label}
                            className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-text-secondary"
                        >
                            <Icon icon={extra.icon} className="h-5 w-5 text-accent" aria-hidden="true" />
                            {extra.label}
                        </li>
                    ))}
                </ul>
                <Link href="/pricing" className="text-sm font-semibold text-accent hover:text-accent-hover">
                    შეადარეთ პაკეტები →
                </Link>
            </div>
        </section>
    );
}

function ModeSwitch({ mode, onChange }: { mode: BusinessMode; onChange: (mode: BusinessMode) => void }) {
    const index = BUSINESS_MODES.findIndex(item => item.value === mode);

    return (
        <div
            role="radiogroup"
            aria-label="ბიზნესის ტიპი"
            className="relative grid w-full grid-cols-3 rounded-2xl border border-border bg-surface p-1 sm:w-auto"
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
                        className={`relative z-10 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-300 sm:px-5 ${
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

/* ---------- ნაბიჯების მინი-სცენები ---------- */

function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 ${className}`}>
            {children}
        </div>
    );
}

function Tag({ children, className = "bg-surface text-text-secondary" }: { children: ReactNode; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium whitespace-nowrap ${className}`}>
            {children}
        </span>
    );
}

function StartVisual() {
    const people = [
        { initials: "ნბ", className: "bg-accent/15 text-accent" },
        { initials: "გკ", className: "bg-success/15 text-success" },
        { initials: "მლ", className: "bg-warning/15 text-warning" },
    ];

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
                <Tag className="bg-success/10 text-success">
                    <Icon icon="solar:document-text-linear" className="h-4 w-4" />
                    ძველი.xlsx
                </Tag>
                <Icon icon="solar:arrow-right-linear" className="h-5 w-5 text-text-secondary" />
                <span className="text-2xl font-bold tabular-nums">142</span>
            </div>
            <p className="text-text-secondary">მომხმარებელი გადმოვიდა</p>
            <div className="flex -space-x-2">
                {people.map(person => (
                    <span
                        key={person.initials}
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-background ${person.className}`}
                    >
                        {person.initials}
                    </span>
                ))}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-secondary ring-2 ring-background">
                    +139
                </span>
            </div>
        </div>
    );
}

function PurchaseVisual({ mode }: { mode: BusinessMode }) {
    const materials = mode === "MANUFACTURING";

    return (
        <>
            <Row>
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <Icon icon="solar:document-text-linear" className="h-4 w-4 shrink-0 text-success" />
                    {materials ? "მასალები.xlsx" : "მომწოდებელი.xlsx"}
                </span>
                <Icon icon="solar:magic-stick-3-bold-duotone" className="h-4 w-4 shrink-0 text-accent" />
            </Row>
            <Row>
                <span>{materials ? "12 მასალა ვიპოვე" : "24 პროდუქტი ვიპოვე"}</span>
                <Icon icon="solar:check-circle-bold" className="h-4 w-4 text-success" />
            </Row>
            <Row>
                <span className="text-text-secondary tabular-nums">$ 410</span>
                <Icon icon="solar:arrow-right-linear" className="h-4 w-4 text-text-secondary" />
                <span className="font-bold tabular-nums">1 107 ₾</span>
            </Row>
        </>
    );
}

function ProductionVisual() {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex justify-center gap-1.5">
                <Tag>ტყავი 0.4 მ²</Tag>
                <Tag>ძაფი 3 მ</Tag>
                <Tag>+1</Tag>
            </div>
            <Icon icon="solar:arrow-down-linear" className="h-5 w-5 text-text-secondary" />
            <Row className="w-full">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <Icon icon="solar:wallet-2-bold-duotone" className="h-5 w-5 shrink-0 text-accent" />
                    საფულე
                </span>
                <span className="font-bold whitespace-nowrap tabular-nums">28 ₾</span>
            </Row>
        </div>
    );
}

function StockVisual({ sold }: { sold: boolean }) {
    return (
        <>
            <div className="flex items-center justify-between">
                <span>ტყავის საფულე</span>
                <span className="flex items-center gap-1.5 tabular-nums">
                    {sold && <span className="order-flow-pop text-[11px] font-semibold text-danger">−1</span>}
                    <b key={sold ? 4 : 5} className="order-flow-pop text-base">{sold ? 4 : 5}</b> ც.
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div className={`h-full rounded-full bg-warning transition-[width] duration-500 ${sold ? "w-1/5" : "w-1/4"}`} />
            </div>
            <Tag className="self-start bg-warning/10 text-warning">
                <Icon icon="solar:danger-triangle-linear" className="h-3.5 w-3.5" />
                მთავრდება
            </Tag>
            <div className="flex items-center justify-between text-text-secondary">
                <span>სუნამო 50 მლ</span>
                <span className="tabular-nums">38 ც.</span>
            </div>
        </>
    );
}

function OrderVisual({ shipped }: { shipped: boolean }) {
    return (
        <>
            <Row className={`transition-colors duration-500 ${shipped ? "border-accent/40" : ""}`}>
                <span className="truncate">ნინო ბერიძე</span>
                <span key={shipped ? "shipped" : "processing"} className="order-flow-pop">
                    {shipped
                        ? <Tag className="bg-accent/10 text-accent">გაგზავნილი</Tag>
                        : <Tag className="bg-warning/10 text-warning">მუშავდება</Tag>}
                </span>
            </Row>
            <Row>
                <span className="truncate text-text-secondary">გიორგი კაპანაძე</span>
                <Tag className="bg-accent/10 text-accent">გაგზავნილი</Tag>
            </Row>
            <div className="flex gap-2">
                <span className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-2 font-semibold text-white">
                    <Icon icon="solar:add-circle-linear" className="h-4 w-4" />
                    შეკვეთა
                </span>
                <span className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2">
                    <Icon icon="solar:qr-code-linear" className="h-4 w-4" />
                    ინვოისი
                </span>
            </div>
        </>
    );
}

const customerMessages = ["მიღებულია", "გზაშია", "მიტანილია"];

function CustomerVisual({ stage }: { stage: number }) {
    const dot = (reached: boolean) => `h-2 w-2 rounded-full transition-colors duration-500 ${reached ? "bg-accent" : "bg-border"}`;
    const line = (reached: boolean) => `h-0.5 flex-1 transition-colors duration-500 ${reached ? "bg-accent" : "bg-border"}`;

    return (
        <div className="mx-auto w-36 rounded-[1.25rem] border-2 border-border bg-surface p-2.5">
            <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-border" />
            <div className="rounded-xl rounded-tl-sm bg-accent/10 px-2.5 py-2 text-[11px] leading-snug text-accent">
                თქვენი შეკვეთა <b key={stage} className="order-flow-pop inline-block font-semibold">{customerMessages[stage]}</b>. სტატუსი: marteo.ge/o/…
            </div>
            <div className="mt-3 flex items-center gap-1">
                <span className={dot(true)} />
                <span className={line(stage >= 1)} />
                <span className={dot(stage >= 1)} />
                <span className={line(stage >= 2)} />
                <span className={dot(stage >= 2)} />
            </div>
        </div>
    );
}

function MoneyVisual({ earned }: { earned: boolean }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 text-text-secondary">
                სუფთა მოგება
                <span
                    className={`rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success transition-all duration-300 ${
                        earned ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    }`}
                >
                    +37 ₾
                </span>
            </p>
            <p key={earned ? "after" : "before"} className="order-flow-pop text-3xl font-bold text-success tabular-nums">
                {earned ? "2 742 ₾" : "2 705 ₾"}
            </p>
            <div className="flex gap-1.5">
                <Tag>65 ₾ გაყიდვა</Tag>
                <Tag>−28 ₾ ხარჯი</Tag>
            </div>
        </div>
    );
}

const growthBars = [40, 55, 45, 70, 100];

function GrowthVisual() {
    return (
        <>
            <div className="flex h-14 items-end gap-1.5">
                {growthBars.map((height, index) => (
                    <span
                        key={index}
                        className={`flex-1 rounded-md ${index === growthBars.length - 1 ? "bg-accent" : "bg-accent/20"}`}
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>
            <div className="flex items-start gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-2 leading-snug">
                <Icon icon="solar:magic-stick-3-bold-duotone" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                საფულე ყველაზე სწრაფად იყიდება, შეუკვეთეთ 20 ცალი.
            </div>
        </>
    );
}
