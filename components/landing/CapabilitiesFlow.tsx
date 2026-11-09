"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/shared/Icon";

import OrderJourney from "@/components/landing/OrderJourney";
import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";

// შესაძლებლობები დიდ სექციებად: ყოველ ნაბიჯს თავისი სექცია აქვს, ერთ მხარეს
// ინტერფეისის სცენით, მეორეზე სათაურით და სამი მოკლე პუნქტით. დესკტოპზე
// სცენა რიგრიგობით მარცხნივ და მარჯვნივ დგას. ზემოთ მიმაგრებული ჩიპები
// სექციებზე გადაგიყვანთ და აჩვენებს, რომელ სექციაზე ხართ. გადამრთველი
// ბიზნესის ტიპს ირჩევს: იმპორტზე წარმოების ნაბიჯი ქრება და ნომრები თავიდან ითვლება.
//
// „ერთი შეკვეთის გზა": სექციის სცენა თავის ცვლილებას მაშინ აჩვენებს, როცა
// ეკრანზე გამოჩნდება (მარაგი −1, გაგზავნა, SMS, მოგება).
// შემცირებული მოძრაობისას საბოლოო მდგომარეობა მაშინვე ჩანს.

type Change = "stock" | "shipped" | "smsSent" | "completed" | "profit";

const JOURNEY_STEP_MS = 1100;

// რომელ ცვლილებებს იწვევს სექციის ეკრანზე გამოჩენა, გვერდის რიგით.
// სწრაფი სქროლი სექციას შეიძლება გამოტოვოს, ამიტომ ქვედა სექცია ზედებსაც ასრულებს.
const changesOnView: { card: string; changes: Change[] }[] = [
    { card: "stock", changes: ["stock"] },
    { card: "orders", changes: ["shipped"] },
    { card: "customers", changes: ["smsSent", "completed"] },
    { card: "money", changes: ["profit"] },
];

const allChanges: Change[] = ["stock", "shipped", "smsSent", "completed", "profit"];

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
    headline: string;
    points: string[];
    // რომელი პაკეტიდან ჩანს (lib/subscription/plans.ts: FEATURE_MIN_TIER).
    plan: "business" | "all";
    visual: (mode: BusinessMode, done: Done) => ReactNode;
    // სცენას თავისი ჩარჩო აქვს (ტელეფონი), ფანჯარაში აღარ ვსვამთ.
    bare?: boolean;
    hidden?: (mode: BusinessMode) => boolean;
};

const steps: Step[] = [
    {
        id: "start",
        icon: "solar:rocket-2-bold-duotone",
        title: "დაწყება",
        plan: "business",
        headline: "ძველი ექსელი ერთ წუთში გადმოდის",
        points: [
            "Excel, CSV ან Numbers ფაილიდან",
            "მარაგი, შეკვეთები და მომხმარებლები",
            "ფაილში ჩასმული ფოტოებიც გადმოდის",
        ],
        visual: () => <StartVisual />,
    },
    {
        id: "purchases",
        icon: "solar:cart-large-2-bold-duotone",
        title: "შესყიდვა",
        plan: "business",
        headline: "მომწოდებლის ფაილს AI თავად კითხულობს",
        points: [
            "ფაილს ატვირთავთ, სიას AI ავსებს",
            "დოლარს ლარად თავად გადაიყვანს",
            "შესყიდვისას მარაგი თავად იზრდება",
        ],
        visual: mode => <PurchaseVisual mode={mode} />,
    },
    {
        id: "production",
        icon: "solar:structure-bold-duotone",
        title: "წარმოება",
        plan: "business",
        headline: "მასალებიდან პროდუქტამდე, ზუსტი ხარჯით",
        points: [
            "მასალების მარაგი ცალკე ითვლება",
            "წარმოებისას მასალა თავად აკლდება",
            "თვითღირებულება ნაყიდი ფასით ითვლება",
        ],
        visual: () => <ProductionVisual />,
        hidden: mode => mode === "IMPORT",
    },
    {
        id: "stock",
        icon: "solar:box-bold-duotone",
        title: "მარაგი",
        plan: "business",
        headline: "მარაგს თავად ითვლის და დროზე გაგაფრთხილებთ",
        points: [
            "შეკვეთისას მცირდება, შესყიდვისას იზრდება",
            "პროდუქტი რომ იწურება, გაფრთხილება მოგივათ",
            "ყველა პროდუქტი ფოტოთი, ერთ სიაში",
        ],
        visual: (_, done) => <StockVisual sold={done.has("stock")} />,
    },
    {
        id: "orders",
        icon: "solar:clipboard-list-bold-duotone",
        title: "შეკვეთა",
        plan: "all",
        headline: "შეკვეთა ერთი დაჭერით, ინვოისით და სტატუსით",
        points: [
            "ყოველ შეკვეთას თავისი სტატუსი აქვს",
            "QR კოდიანი PDF ინვოისი ერთი დაჭერით იბეჭდება",
            "შეკვეთა მარაგს და მოგებას თავად ცვლის",
        ],
        visual: (_, done) => <OrderVisual shipped={done.has("shipped")} />,
    },
    {
        id: "customers",
        icon: "solar:users-group-rounded-bold-duotone",
        title: "მომხმარებელი",
        plan: "all",
        headline: "მომხმარებელმა ყოველთვის იცის, სად არის შეკვეთა",
        points: [
            "სტატუსს პირადი ბმულით ხედავს",
            "გაგზავნისას SMS თავად მიდის (ბიზნესი, PRO)",
            "ყოველი მომხმარებლის შეკვეთები ერთ ადგილას",
        ],
        visual: (_, done) => <CustomerVisual stage={done.has("completed") ? 2 : done.has("smsSent") ? 1 : 0} />,
        bare: true,
    },
    {
        id: "money",
        icon: "solar:wallet-money-bold-duotone",
        title: "მოგება",
        plan: "all",
        headline: "ხედავთ მოგებას, არა მხოლოდ შემოსავალს",
        points: [
            "გაყიდვას თვითღირებულება აკლდება",
            "ხარჯებიც ითვლება: რეკლამა, ქირა და სხვა",
            "ნებისმიერი პერიოდი, პირველი დღიდან დღემდე",
        ],
        visual: (_, done) => <MoneyVisual earned={done.has("profit")} />,
    },
    {
        id: "growth",
        icon: "solar:graph-up-bold-duotone",
        title: "ზრდა",
        plan: "all",
        headline: "ციფრები და AI რჩევა შემდეგ ნაბიჯზე",
        points: [
            "გრაფიკებით ხედავთ, რა იყიდება",
            "Marteo AI გირჩევთ, რა შეუკვეთოთ (ბიზნესი, PRO)",
            "კითხვას ქართულად წერთ და პასუხს მაშინვე იღებთ",
        ],
        visual: () => <GrowthVisual />,
    },
];

const planLabels: Record<Step["plan"], string> = {
    business: "ბიზნესი და PRO",
    all: "ყველა პაკეტში",
};

const extras = [
    { icon: "solar:devices-bold-duotone", label: "ყველა მოწყობილობაზე" },
    { icon: "solar:users-group-two-rounded-bold-duotone", label: "გუნდი და როლები" },
    { icon: "solar:bell-bold-duotone", label: "შეტყობინებები" },
    { icon: "solar:chat-round-dots-bold-duotone", label: "მხარდაჭერა" },
];

export default function CapabilitiesFlow() {
    const [mode, setMode] = useState<BusinessMode>("HYBRID");
    const [done, setDone] = useState<Done>(() => new Set());
    const [activeStep, setActiveStep] = useState(steps[0].id);
    const listRef = useRef<HTMLOListElement>(null);
    const chipsRef = useRef<HTMLDivElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
    const shown: Done = reducedMotion ? new Set(allChanges) : done;
    const visible = steps.filter(step => !step.hidden?.(mode));

    // შეკვეთის გზა: სცენა თავის ცვლილებას მაშინ აჩვენებს, როცა ეკრანზეა.
    useEffect(() => {
        const list = listRef.current;
        if (!list || reducedMotion) return;

        const pending = timers.current;
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                observer.unobserve(entry.target);
                const position = changesOnView.findIndex(item => item.card === (entry.target as HTMLElement).dataset.step);
                if (position < 0) continue;
                const skipped = changesOnView.slice(0, position).flatMap(item => item.changes);
                setDone(previous => new Set([...previous, ...skipped]));
                changesOnView[position].changes.forEach((change, index) => pending.push(setTimeout(() => {
                    setDone(previous => new Set(previous).add(change));
                }, 400 + index * JOURNEY_STEP_MS)));
            }
        }, { threshold: 0.6 });
        list.querySelectorAll("[data-step]").forEach(scene => observer.observe(scene));

        return () => {
            observer.disconnect();
            pending.forEach(clearTimeout);
            pending.length = 0;
        };
    }, [reducedMotion]);

    // აქტიური ჩიპი: სექცია, რომელიც ეკრანის შუა ზოლს კვეთს.
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;

        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) setActiveStep((entry.target as HTMLElement).id);
            }
        }, { rootMargin: "-45% 0px -50% 0px" });
        list.querySelectorAll(":scope > li").forEach(section => observer.observe(section));

        return () => observer.disconnect();
    }, [mode]);

    // ტელეფონზე ჩიპები გვერდულად იქაჩება: აქტიური ჩიპი ხილვად ზოლში რჩება.
    useEffect(() => {
        const chips = chipsRef.current;
        const chip = chips?.querySelector<HTMLElement>(`[data-chip="${activeStep}"]`);
        if (!chips || !chip) return;
        const left = chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2;
        chips.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
    }, [activeStep, reducedMotion]);

    const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
        event.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
        history.replaceState(null, "", `#${id}`);
    };

    return (
        <section aria-label="მართეოს შესაძლებლობები" className="pb-12 sm:pb-16">
            <div className="mx-auto flex max-w-7xl justify-center px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
                <ModeSwitch mode={mode} onChange={setMode} />
            </div>

            <nav
                aria-label="შესაძლებლობების ნავიგაცია"
                className="sticky top-16 z-30 mt-6 border-y border-border bg-background/85 backdrop-blur-md"
            >
                <div ref={chipsRef} className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 lg:justify-center lg:px-8">
                    {visible.map((step, index) => {
                        const active = activeStep === step.id;

                        return (
                            <a
                                key={step.id}
                                href={`#${step.id}`}
                                data-chip={step.id}
                                aria-current={active ? "true" : undefined}
                                onClick={event => goTo(event, step.id)}
                                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 sm:h-9 text-sm font-medium whitespace-nowrap transition-colors ${
                                    active
                                        ? "border-accent bg-accent text-white"
                                        : "border-border bg-surface text-text-secondary hover:border-accent/50 hover:text-text-primary"
                                }`}
                            >
                                <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-text-secondary/70"}`}>{index + 1}</span>
                                {step.title}
                            </a>
                        );
                    })}
                </div>
            </nav>

            <ol ref={listRef} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                {visible.map((step, index) => (
                    <li
                        key={step.id}
                        id={step.id}
                        className="grid scroll-mt-32 items-center gap-6 border-b border-border py-12 last:border-b-0 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20"
                    >
                        <div
                            aria-hidden="true"
                            data-step={step.id}
                            className={`flex min-h-80 items-center justify-center overflow-hidden rounded-3xl border border-border bg-surface p-3 text-sm text-text-primary select-none sm:p-8 ${
                                index % 2 === 1 ? "lg:order-2" : ""
                            }`}
                        >
                            <div className={`flex w-full max-w-sm flex-col justify-center gap-2.5 ${
                                step.bare ? "" : "rounded-2xl border border-border bg-background p-3.5 shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)] sm:p-5"
                            }`}>
                                {step.visual(mode, shown)}
                            </div>
                        </div>

                        <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-accent">
                                <Icon icon={step.icon} className="h-5 w-5 shrink-0" aria-hidden="true" />
                                <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                · {step.title}
                                <Link
                                    href="/pricing"
                                    className="relative ml-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] hover:border-accent/50 hover:text-accent"
                                >
                                    {planLabels[step.plan]}
                                </Link>
                            </p>
                            <h2 className="mt-3 text-[clamp(1.35rem,4vw,2rem)] leading-tight font-bold text-balance text-text-primary">
                                {step.headline}
                            </h2>
                            <ul className="mt-5 space-y-3">
                                {step.points.map(point => (
                                    <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary sm:text-base">
                                        <Icon icon="solar:check-circle-bold" className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </li>
                ))}
            </ol>

            <p className="mx-auto mt-2 mb-12 flex max-w-7xl items-center justify-center gap-2 px-4 text-sm text-text-secondary sm:mb-16 sm:px-6 lg:px-8">
                <Icon icon="solar:refresh-circle-linear" className="h-5 w-5 text-accent" aria-hidden="true" />
                ციკლი თავიდან იწყება: შემდეგი შესყიდვა უკვე ციფრებით.
            </p>

            <OrderJourney />

            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                <BeforeAfter />

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
                    <Link href="/pricing" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:text-accent-hover">
                        შეადარეთ პაკეტები →
                    </Link>
                </div>
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

const before = [
    "შეკვეთები რვეულში და ჩატებში იკარგება",
    "მარაგს თვალით ითვლით",
    "მომხმარებელი გწერთ: „სად არის ჩემი შეკვეთა?“",
    "თვის ბოლოს არ იცით, რამდენი გამოიმუშავეთ",
];

const after = [
    "ყველა შეკვეთა ერთ სიაშია",
    "მარაგი თავად ითვლება",
    "სტატუსს მომხმარებელი თავად ხედავს",
    "სუფთა მოგება ყოველდღე ჩანს",
];

function BeforeAfter() {
    return (
        <section aria-labelledby="before-after-title" className="pt-12 sm:pt-16">
            <h2 id="before-after-title" className="text-center text-[clamp(1.35rem,4vw,2rem)] leading-tight font-bold text-balance text-text-primary">
                რა იცვლება მართეოთი
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
                    <p className="font-semibold text-text-secondary">ადრე</p>
                    <ul className="mt-4 space-y-3">
                        {before.map(item => (
                            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary sm:text-base">
                                <Icon icon="solar:close-circle-bold" className="mt-0.5 h-5 w-5 shrink-0 text-danger/70" aria-hidden="true" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-3xl border border-accent/50 bg-surface p-5 shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)] sm:p-6">
                    <p className="font-semibold text-accent">მართეოთი</p>
                    <ul className="mt-4 space-y-3">
                        {after.map(item => (
                            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-primary sm:text-base">
                                <Icon icon="solar:check-circle-bold" className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

/* ---------- ნაბიჯების სცენები ---------- */

// სცენები სექციის ჩარჩოში აპლიკაციის ფანჯარასავით ჩანს: წასაკითხი ზომით
// და ერთმანეთთან შეთანხმებული ციფრებით (შესყიდვის კურსი 2.70, საფულის
// თვითღირებულება 28 ₾, გაყიდვა 65 ₾, მოგება +37 ₾).

function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 ${className}`}>
            {children}
        </div>
    );
}

function Tag({ children, className = "bg-surface text-text-secondary" }: { children: ReactNode; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap ${className}`}>
            {children}
        </span>
    );
}

function SceneHeader({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 truncate font-semibold">
                <Icon icon={icon} className="h-5 w-5 shrink-0 text-accent" />
                {title}
            </span>
            {children}
        </div>
    );
}

function StartVisual() {
    const counts = [
        { label: "მომხმარებელი", value: "142" },
        { label: "პროდუქტი", value: "86" },
        { label: "შეკვეთა", value: "1 240" },
    ];

    return (
        <>
            <Row>
                <span className="flex min-w-0 items-center gap-2 truncate">
                    <Icon icon="solar:document-text-bold-duotone" className="h-6 w-6 shrink-0 text-success" />
                    <span className="min-w-0">
                        <span className="block truncate font-medium">ძველი_ბაზა.xlsx</span>
                        <span className="block text-xs text-text-secondary">3 ფურცელი · ფოტოებით</span>
                    </span>
                </span>
                <Icon icon="solar:check-circle-bold" className="h-5 w-5 shrink-0 text-success" />
            </Row>
            <Icon icon="solar:arrow-down-linear" className="mx-auto h-5 w-5 text-text-secondary" />
            <div className="grid grid-cols-3 gap-2">
                {counts.map(count => (
                    <div key={count.label} className="rounded-xl border border-border bg-surface px-2 py-3 text-center">
                        <p className="text-xl font-bold tabular-nums">{count.value}</p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">{count.label}</p>
                    </div>
                ))}
            </div>
        </>
    );
}

const purchaseLines = {
    products: [
        { name: "ტყავის საფულე", qty: "20 ც.", usd: "$6", gel: "16.20 ₾" },
        { name: "ქამარი", qty: "10 ც.", usd: "$9", gel: "24.30 ₾" },
        { name: "ბარათის ქისა", qty: "25 ც.", usd: "$8", gel: "21.60 ₾" },
    ],
    materials: [
        { name: "ტყავი", qty: "12 მ²", usd: "$25", gel: "67.50 ₾" },
        { name: "ძაფი", qty: "20 ც.", usd: "$3", gel: "8.10 ₾" },
        { name: "ღილი", qty: "500 ც.", usd: "$0.10", gel: "0.27 ₾" },
    ],
};

function PurchaseVisual({ mode }: { mode: BusinessMode }) {
    const materials = mode === "MANUFACTURING";
    const lines = materials ? purchaseLines.materials : purchaseLines.products;

    return (
        <>
            <SceneHeader icon="solar:document-text-bold-duotone" title={materials ? "მასალები.xlsx" : "მომწოდებელი.xlsx"}>
                <Tag className="bg-accent/10 text-accent">
                    <Icon icon="solar:magic-stick-3-bold-duotone" className="h-4 w-4" />
                    AI ავსებს
                </Tag>
            </SceneHeader>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {lines.map(line => (
                    <div key={line.name} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="min-w-0 truncate">
                            {line.name} <span className="text-text-secondary">· {line.qty}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                            <span className="text-text-secondary">{line.usd}</span>
                            <Icon icon="solar:arrow-right-linear" className="h-3.5 w-3.5 text-text-secondary" />
                            <span className="font-medium">{line.gel}</span>
                        </span>
                    </div>
                ))}
            </div>
            <Row className="border-success/30 bg-success/5">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-success">
                    <Icon icon="solar:box-bold-duotone" className="h-5 w-5 shrink-0" />
                    დაემატა
                </span>
                <span className="font-bold whitespace-nowrap tabular-nums">$410 → 1 107 ₾</span>
            </Row>
        </>
    );
}

const productionInputs = [
    { name: "ტყავი", qty: "0.4 მ²", cost: "27.00 ₾" },
    { name: "ღილი", qty: "2 ც.", cost: "0.54 ₾" },
    { name: "ძაფი", qty: "3 მ", cost: "0.46 ₾" },
];

function ProductionVisual() {
    return (
        <>
            <SceneHeader icon="solar:structure-bold-duotone" title="ტყავის საფულე">
                <Tag>1 ცალი</Tag>
            </SceneHeader>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {productionInputs.map(input => (
                    <div key={input.name} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="min-w-0 truncate">{input.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                            <span className="text-xs text-danger">−{input.qty}</span>
                            <span className="font-medium">{input.cost}</span>
                        </span>
                    </div>
                ))}
            </div>
            <Row className="border-accent/40">
                <span className="text-text-secondary">თვითღირებულება</span>
                <span className="text-lg font-bold tabular-nums">28.00 ₾</span>
            </Row>
        </>
    );
}

function StockVisual({ sold }: { sold: boolean }) {
    const others = [
        { name: "ქამარი", qty: 38, width: "w-4/5" },
        { name: "ბარათის ქისა", qty: 21, width: "w-1/2" },
    ];

    return (
        <>
            <SceneHeader icon="solar:box-bold-duotone" title="მარაგი">
                <Tag className="bg-warning/10 text-warning">
                    <Icon icon="solar:bell-bold-duotone" className="h-4 w-4" />
                    1 იწურება
                </Tag>
            </SceneHeader>
            <div className="rounded-xl border border-warning/40 bg-surface px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 truncate font-medium">
                        <Icon icon="solar:wallet-2-bold-duotone" className="h-5 w-5 shrink-0 text-accent" />
                        ტყავის საფულე
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                        {sold && <span className="order-flow-pop text-xs font-semibold text-danger">−1</span>}
                        <b key={sold ? 4 : 5} className="order-flow-pop text-lg">{sold ? 4 : 5}</b> ც.
                    </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                    <div className={`h-full rounded-full bg-warning transition-[width] duration-500 ${sold ? "w-[10%]" : "w-[12%]"}`} />
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-warning">
                    <Icon icon="solar:danger-triangle-linear" className="h-3.5 w-3.5" />
                    მთავრდება, დროა შეუკვეთოთ
                </p>
            </div>
            {others.map(item => (
                <div key={item.name} className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{item.name}</span>
                        <span className="tabular-nums text-text-secondary">{item.qty} ც.</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                        <div className={`h-full rounded-full bg-success ${item.width}`} />
                    </div>
                </div>
            ))}
        </>
    );
}

function OrderVisual({ shipped }: { shipped: boolean }) {
    return (
        <>
            <SceneHeader icon="solar:clipboard-list-bold-duotone" title="შეკვეთები">
                <span className="text-xs text-text-secondary">დღეს · 14</span>
            </SceneHeader>
            <Row className={`transition-colors duration-500 ${shipped ? "border-accent/50" : ""}`}>
                <span className="min-w-0">
                    <span className="block truncate font-medium">ნინო ბერიძე</span>
                    <span className="block text-xs text-text-secondary tabular-nums">#1042 · 65 ₾</span>
                </span>
                <span key={shipped ? "shipped" : "processing"} className="order-flow-pop">
                    {shipped
                        ? <Tag className="bg-accent/10 text-accent">გაგზავნილი</Tag>
                        : <Tag className="bg-warning/10 text-warning">მუშავდება</Tag>}
                </span>
            </Row>
            <Row>
                <span className="min-w-0">
                    <span className="block truncate">გიორგი კაპანაძე</span>
                    <span className="block text-xs text-text-secondary tabular-nums">#1041 · 120 ₾</span>
                </span>
                <Tag className="bg-success/10 text-success">დასრულებული</Tag>
            </Row>
            <div className="flex gap-2">
                <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 font-semibold text-white">
                    <Icon icon="solar:add-circle-linear" className="h-5 w-5" />
                    შეკვეთა
                </span>
                <span className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                    <Icon icon="solar:qr-code-linear" className="h-5 w-5" />
                    ინვოისი
                </span>
            </div>
        </>
    );
}

// მომხმარებლის მხარე, როგორც რეალურად ხდება: გაგზავნისას მიდის ერთი SMS
// (ტექსტი lib/sms/order-sms.ts-დანაა), სტატუსებს კი პირად ბმულზე ხედავს.
const customerStatuses = ["მუშავდება", "გაგზავნილი", "დასრულებული"];

const DEMO_BUSINESS = "ტყავის სახელოსნო";

function CustomerVisual({ stage }: { stage: number }) {
    const dot = (reached: boolean) => `h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-500 ${reached ? "bg-accent" : "bg-border"}`;

    return (
        <div className="mx-auto w-64 rounded-[2rem] border-2 border-border bg-background p-4 shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
            <p className="text-center text-xs text-text-secondary">SMS</p>
            <div className="mt-2 min-h-[4.5rem]">
                {stage >= 1 ? (
                    <div className="order-flow-pop rounded-2xl rounded-tl-sm bg-accent/10 px-3 py-2.5 text-[13px] leading-snug text-accent">
                        <b className="font-semibold">{DEMO_BUSINESS}:</b> თქვენი შეკვეთა კურიერს გადაეცა, მალე მიიღებთ.
                    </div>
                ) : (
                    <div className="inline-flex gap-1 rounded-2xl rounded-tl-sm bg-surface px-3 py-3">
                        {[0, 1, 2].map(index => <span key={index} className="h-1.5 w-1.5 rounded-full bg-border" />)}
                    </div>
                )}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                <p className="flex items-center gap-1 text-[11px] text-text-secondary">
                    <Icon icon="solar:link-round-linear" className="h-3.5 w-3.5" />
                    შეკვეთის სტატუსი
                </p>
                <ol className="mt-2 space-y-1.5">
                    {customerStatuses.map((status, index) => (
                        <li
                            key={status}
                            className={`flex items-center gap-2 text-xs transition-colors duration-500 ${index <= stage ? "text-text-primary" : "text-text-secondary"}`}
                        >
                            <span className={dot(index <= stage)} />
                            {status}
                            {index === stage && <Icon icon="solar:check-circle-bold" className="order-flow-pop ml-auto h-4 w-4 text-accent" />}
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

function MoneyVisual({ earned }: { earned: boolean }) {
    return (
        <>
            <SceneHeader icon="solar:wallet-money-bold-duotone" title="სუფთა მოგება">
                <Tag>ეს თვე</Tag>
            </SceneHeader>
            <div className="flex items-baseline gap-2">
                <p key={earned ? "after" : "before"} className="order-flow-pop text-4xl font-bold text-success tabular-nums">
                    {earned ? "2 742 ₾" : "2 705 ₾"}
                </p>
                <span
                    className={`rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success transition-all duration-300 ${
                        earned ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    }`}
                >
                    +37 ₾
                </span>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface tabular-nums">
                <div className="flex justify-between px-3.5 py-2">
                    <span className="text-text-secondary">გაყიდვა</span>
                    <span>65.00 ₾</span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                    <span className="text-text-secondary">თვითღირებულება</span>
                    <span className="text-danger">−28.00 ₾</span>
                </div>
                <div className="flex justify-between px-3.5 py-2 font-semibold">
                    <span>მოგება შეკვეთაზე</span>
                    <span className="text-success">+37.00 ₾</span>
                </div>
            </div>
        </>
    );
}

const growthBars = [
    { month: "ივნ", height: 40 },
    { month: "ივლ", height: 55 },
    { month: "აგვ", height: 45 },
    { month: "სექ", height: 70 },
    { month: "ოქტ", height: 100 },
];

function GrowthVisual() {
    return (
        <>
            <SceneHeader icon="solar:graph-up-bold-duotone" title="გაყიდვები">
                <Tag className="bg-success/10 text-success">+43%</Tag>
            </SceneHeader>
            <div className="flex h-24 items-end gap-2">
                {growthBars.map((bar, index) => (
                    <span key={bar.month} className="flex h-full flex-1 flex-col justify-end gap-1">
                        <span
                            className={`rounded-md ${index === growthBars.length - 1 ? "bg-accent" : "bg-accent/20"}`}
                            style={{ height: `${bar.height}%` }}
                        />
                    </span>
                ))}
            </div>
            <div className="flex gap-2 text-center text-xs text-text-secondary">
                {growthBars.map(bar => <span key={bar.month} className="flex-1">{bar.month}</span>)}
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 leading-snug">
                <Icon icon="solar:magic-stick-3-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span><b className="font-semibold">Marteo AI:</b> საფულე ყველაზე სწრაფად იყიდება, შეუკვეთეთ 20 ცალი.</span>
            </div>
        </>
    );
}
