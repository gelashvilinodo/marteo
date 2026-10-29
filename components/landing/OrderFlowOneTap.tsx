"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { Icon } from "@iconify/react";

// „ერთი დაჭერა": სქროლზე მიბმული სამი მომენტი.
// 1) შევსებულ შეკვეთაზე ერთი დაჭერა; 2) ოთხი შედეგი თავისით ნათდება —
// ინვოისი, მარაგი, მოგება, მომხმარებლის სტატუსი; 3) ყველაფერი ერთ შეჯამებაში იკრიბება.

// ყველა სათაური ზუსტად ორ ხაზზეა, რომ მომენტების გადართვისას განლაგება არ ხტებოდეს.
const moments = [
    { from: 0, caption: ["შენ მხოლოდ", "შეკვეთას ამატებ."] },
    { from: 0.3, caption: ["დანარჩენს", "MARTEO აკეთებს."] },
    { from: 0.72, caption: ["შენ ბიზნესს მართავ.", "ციფრებს - MARTEO."] },
];

// მომენტების დრო (t = 0…1 სექციის სქროლზე).
const T = {
    pointerIn: [0.03, 0.12],
    press: 0.15,
    move: [0.3, 0.37],
    // ხაზები ნელა იხაზება: თითოს ~21svh სქროლი, ბარათი ხაზის ბოლოს ნათდება.
    results: [
        { line: [0.37, 0.44], lit: 0.435 },
        { line: [0.44, 0.51], lit: 0.505 },
        { line: [0.51, 0.58], lit: 0.575 },
        { line: [0.58, 0.65], lit: 0.645 },
    ],
    fold: [0.72, 0.79],
    summary: [0.76, 0.84],
    count: [0.8, 0.9],
} as const;

const resultCards = [
    {
        kind: "invoice",
        label: "ინვოისი მზადაა",
        caption: "PDF QR კოდით - ერთი დაჭერით დაბეჭდე",
        icon: "solar:document-text-bold-duotone",
        tone: "bg-text-primary/10 text-text-primary",
        ring: "border-text-primary/40",
        stroke: "var(--marteo-text-primary)",
    },
    {
        kind: "stock",
        label: "მარაგი ავტომატურად მცირდება",
        caption: "ტყავის საფულე · −1",
        icon: "solar:box-minimalistic-bold-duotone",
        tone: "bg-warning/10 text-warning",
        ring: "border-warning/50",
        stroke: "var(--marteo-warning)",
    },
    {
        kind: "profit",
        label: "სუფთა მოგება",
        caption: "65 ₾ − 28 ₾ თვითღირებულება",
        icon: "solar:graph-up-bold-duotone",
        tone: "bg-success/10 text-success",
        ring: "border-success/50",
        stroke: "var(--marteo-success)",
    },
    {
        kind: "customer",
        label: "მომხმარებელი ინფორმირებულია",
        caption: "შეკვეთის სტატუსს პირად ბმულზე ხედავს",
        icon: "solar:delivery-bold-duotone",
        tone: "bg-accent/10 text-accent",
        ring: "border-accent/50",
        stroke: "var(--marteo-accent)",
    },
] as const;

type ResultItem = (typeof resultCards)[number];

function clamp(value: number) {
    return Math.min(Math.max(value, 0), 1);
}

function seg(t: number, from: number, to: number) {
    return clamp((t - from) / (to - from));
}

function ease(x: number) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function money(value: number) {
    return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₾`;
}

type Box = { x: number; y: number; w: number; h: number };

// ელემენტის კოორდინატები სცენის მიმართ, transform-ების გარეშე.
function boxOf(element: HTMLElement | null, root: HTMLElement): Box | null {
    if (!element) return null;

    let x = 0;
    let y = 0;
    let node: HTMLElement | null = element;

    while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }

    return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

type Layout = {
    wide: boolean;
    touch: boolean;
    w: number;
    h: number;
    card: Box | null;
    button: Box | null;
    results: (Box | null)[];
    summaryHeight: number;
};

export default function OrderFlowOneTap() {
    const trackRef = useRef<HTMLDivElement>(null);
    const stickyRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLSpanElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const resultRefs = useRef<(HTMLDivElement | null)[]>([]);
    const summaryRef = useRef<HTMLDivElement>(null);

    const [t, setT] = useState(0);
    const [layout, setLayout] = useState<Layout>({
        wide: true,
        touch: false,
        w: 0,
        h: 0,
        card: null,
        button: null,
        results: [],
        summaryHeight: 0,
    });

    useEffect(() => {
        const track = trackRef.current;
        const sticky = stickyRef.current;
        if (!track || !sticky) return;

        let frame = 0;

        function update() {
            frame = 0;
            if (!track || !sticky) return;

            const offset = parseFloat(getComputedStyle(sticky).top) || 0;
            const distance = track.offsetHeight - sticky.offsetHeight;
            const scrolled = offset - track.getBoundingClientRect().top;

            setT(distance > 0 ? Math.round(clamp(scrolled / distance) * 2000) / 2000 : 0);
        }

        function requestUpdate() {
            if (!frame) frame = requestAnimationFrame(update);
        }

        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate);
        update();

        return () => {
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestUpdate);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    // სცენის ზომა და ელემენტების ბუნებრივი პოზიციები. ყველა მოძრაობა
    // transform-ითაა, ამიტომ ეს გაზომვა სქროლზე არ იცვლება.
    const measure = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const width = scene.clientWidth;

        setLayout({
            wide: width >= 720,
            touch: window.matchMedia("(pointer: coarse)").matches || width < 640,
            w: width,
            h: scene.clientHeight,
            card: boxOf(cardRef.current, scene),
            button: boxOf(buttonRef.current, scene),
            results: resultRefs.current.map(element => boxOf(element, scene)),
            summaryHeight: summaryRef.current?.offsetHeight ?? 0,
        });
    }, []);

    useLayoutEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const observer = new ResizeObserver(measure);
        observer.observe(scene);
        if (cardRef.current) observer.observe(cardRef.current);
        if (resultsRef.current) observer.observe(resultsRef.current);
        document.fonts?.ready.then(measure);

        return () => observer.disconnect();
    }, [measure]);

    // განლაგების შეცვლისას (ფართო ↔ ვიწრო) კოორდინატები თავიდან ითვლება.
    useLayoutEffect(measure, [layout.wide, measure]);

    const { wide, touch, card, button, results } = layout;
    const first = results[0];
    const last = results[results.length - 1];
    const resultsHeight = first && last ? last.y + last.h - first.y : 0;
    const gap = first && card ? first.y - (card.y + card.h) : 0;

    // ვიწრო ეკრანზე ბარათი პატარავდება, რომ ოთხივე შედეგი ქვემოთ ჩაეტიოს.
    const narrowScale = !wide && card
        ? Math.min(Math.max((layout.h - resultsHeight - gap - 16) / card.h, 0.45), 0.85)
        : 1;

    // მთლიანი სცენა ჩაეტევა ნებისმიერ სიმაღლეს.
    const fit = (() => {
        if (!card || !layout.h) return 1;
        const needed = wide
            ? Math.max(card.h, resultsHeight) + 16
            : card.h * narrowScale + gap + resultsHeight + 16;
        return Math.min(1, layout.h / needed, layout.h / (card.h + 16));
    })();

    const summaryFit = layout.summaryHeight ? Math.min(1, layout.h / layout.summaryHeight) : 1;

    const moment = moments.reduce((found, item, index) => (t >= item.from ? index : found), 0);
    const pressed = t >= T.press - 0.006 && t <= T.press + 0.006;
    const added = t >= T.press;
    const ripple = seg(t, T.press - 0.003, T.press + 0.03);
    const move = ease(seg(t, T.move[0], T.move[1]));
    const fold = ease(seg(t, T.fold[0], T.fold[1]));
    const summary = ease(seg(t, T.summary[0], T.summary[1]));
    const count = ease(seg(t, T.count[0], T.count[1]));
    const lit = T.results.map(item => t >= item.lit);
    const lines = T.results.map(item => ease(seg(t, item.line[0], item.line[1])));

    // პირველ მომენტში ბარათი სცენის ცენტრშია, მერე თავის ადგილზე გადადის.
    const centerShift = card
        ? {
            x: wide ? layout.w / 2 - (card.x + card.w / 2) : 0,
            y: layout.h / 2 - (card.y + card.h / 2),
        }
        : { x: 0, y: 0 };

    const cardScale = 1 - move * (1 - narrowScale);
    // ვიწრო ეკრანზე ბარათი ქვემოდან პატარავდება, ჯგუფი კი ცენტრისკენ იწევს.
    const groupShift = !wide && card ? (-card.h * (1 - narrowScale) / 2) * move : 0;

    const pointer = (() => {
        const enter = ease(seg(t, T.pointerIn[0], T.pointerIn[1]));
        const target = button
            ? { x: button.x + button.w * 0.62 + centerShift.x, y: button.y + button.h / 2 + centerShift.y }
            : { x: layout.w / 2, y: layout.h / 2 };
        const start = { x: target.x + layout.w * 0.25, y: layout.h + 60 };

        return {
            x: start.x + (target.x - start.x) * enter,
            y: start.y + (target.y - start.y) * enter,
            opacity: seg(t, 0.02, 0.05) * (1 - seg(t, 0.2, 0.26)),
        };
    })();

    return (
        <section
            id="how-it-works"
            aria-labelledby="order-flow-title"
            className="order-flow-section relative border-t border-border bg-background"
        >
            <h2 id="order-flow-title" className="sr-only">
                როგორ მუშაობს MARTEO
            </h2>

            {/* ~3 ეკრანის სქროლი. */}
            <div ref={trackRef} className="relative h-[calc(100svh-4rem+300svh)]">
                <div
                    ref={stickyRef}
                    className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] flex h-[calc(100svh-4rem-env(safe-area-inset-top,0px))] flex-col overflow-hidden"
                >
                    <div className="order-flow-glow pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--marteo-accent)_9%,transparent),transparent_65%)]" />

                    <Caption t={t} moment={moment} />

                    <div aria-hidden="true" className="relative mx-auto min-h-0 w-full max-w-5xl flex-1 select-none">
                        <div
                            ref={sceneRef}
                            className="absolute inset-x-4 inset-y-2 sm:inset-x-6 lg:inset-x-8"
                        >
                            <div
                                className="absolute inset-0"
                                style={{
                                    opacity: 1 - fold,
                                    transform: `translateY(${groupShift}px) scale(${fit * (1 - fold * 0.08)})`,
                                }}
                            >
                                <div
                                    className={
                                        wide
                                            ? "flex h-full items-center justify-between gap-10"
                                            : "flex h-full flex-col items-center justify-center gap-5"
                                    }
                                >
                                    <div
                                        ref={cardRef}
                                        className={`relative z-10 w-full max-w-[22rem] shrink-0 ${wide ? "origin-center" : "origin-bottom"}`}
                                        style={{
                                            transform: `translate3d(${centerShift.x * (1 - move)}px, ${centerShift.y * (1 - move)}px, 0) scale(${cardScale})`,
                                        }}
                                    >
                                        <OrderCard added={added} pressed={pressed} buttonRef={buttonRef} />
                                    </div>

                                    <div
                                        ref={resultsRef}
                                        className={
                                            wide
                                                ? "flex w-full max-w-sm flex-col gap-4"
                                                : "grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-3"
                                        }
                                    >
                                        {resultCards.map((item, index) => (
                                            <ResultCard
                                                key={item.kind}
                                                ref={element => {
                                                    resultRefs.current[index] = element;
                                                }}
                                                item={item}
                                                wide={wide}
                                                lit={lit[index]}
                                                appear={seg(t, T.results[index].line[0] - 0.02, T.results[index].line[0] + 0.02) * move}
                                                grow={ease(seg(t, T.results[index].lit, T.results[index].lit + 0.04))}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {card && (
                                    <Connectors
                                        wide={wide}
                                        card={card}
                                        results={results}
                                        lines={lines}
                                        opacity={move}
                                    />
                                )}

                                {pointer.opacity > 0 && (
                                    <Pointer
                                        x={pointer.x}
                                        y={pointer.y}
                                        opacity={pointer.opacity}
                                        touch={touch}
                                        pressed={pressed}
                                        ripple={ripple}
                                    />
                                )}
                            </div>

                            <div
                                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                                style={{
                                    opacity: summary,
                                    transform: `scale(${summaryFit * (0.9 + summary * 0.1)})`,
                                }}
                            >
                                <div ref={summaryRef} className="w-full max-w-xl">
                                    <Summary count={count} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <Progress t={t} moment={moment} />
                </div>
            </div>
        </section>
    );
}

function Connectors({
    wide,
    card,
    results,
    lines,
    opacity,
}: {
    wide: boolean;
    card: Box;
    results: (Box | null)[];
    lines: number[];
    opacity: number;
}) {
    const boxes = results.filter((box): box is Box => box !== null);
    if (boxes.length !== resultCards.length) return null;

    const radius = 10;

    // ფართო ეკრანზე: ბარათის მარჯვენა კიდიდან თითო შედეგამდე მრუდი.
    // ვიწრო ეკრანზე: ბარათის ქვემოდან ცენტრალური ხაზი და განშტოებები 2×2 ბადეში.
    const paths = boxes.map(box => {
        if (wide) {
            const x1 = card.x + card.w;
            const y1 = card.y + card.h / 2;
            const x2 = box.x;
            const y2 = box.y + box.h / 2;
            const mid = (x1 + x2) / 2;

            return { d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, end: { x: x2, y: y2 } };
        }

        const spine = (boxes[0].x + boxes[1].x + boxes[1].w) / 2;
        const top = card.y + card.h;
        const y = box.y + box.h / 2;
        const left = box.x + box.w / 2 < spine;
        const edge = left ? box.x + box.w : box.x;
        const turn = left ? -radius : radius;

        return {
            d: `M ${spine} ${top} L ${spine} ${y - radius} Q ${spine} ${y} ${spine + turn} ${y} L ${edge} ${y}`,
            end: { x: edge, y },
        };
    });

    return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ opacity }}>
            {paths.map((path, index) => (
                <path
                    key={`base-${resultCards[index].kind}`}
                    d={path.d}
                    fill="none"
                    stroke="var(--marteo-border)"
                    strokeWidth="2"
                />
            ))}

            {paths.map((path, index) => (
                <g key={resultCards[index].kind}>
                    <path
                        d={path.d}
                        fill="none"
                        stroke={resultCards[index].stroke}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        pathLength={1}
                        strokeDasharray="1"
                        strokeDashoffset={1 - lines[index]}
                    />
                    <circle
                        cx={path.end.x}
                        cy={path.end.y}
                        r={lines[index] >= 1 ? 5 : 0}
                        fill={resultCards[index].stroke}
                        className="transition-[r] duration-300"
                    />
                </g>
            ))}

            <circle
                cx={wide ? card.x + card.w : (boxes[0].x + boxes[1].x + boxes[1].w) / 2}
                cy={wide ? card.y + card.h / 2 : card.y + card.h}
                r="6"
                fill="var(--marteo-success)"
            />
        </svg>
    );
}

function Pointer({
    x,
    y,
    opacity,
    touch,
    pressed,
    ripple,
}: {
    x: number;
    y: number;
    opacity: number;
    touch: boolean;
    pressed: boolean;
    ripple: number;
}) {
    return (
        <div
            className="pointer-events-none absolute top-0 left-0 z-30"
            style={{ opacity, transform: `translate3d(${x}px, ${y}px, 0)` }}
        >
            {ripple > 0 && ripple < 1 && (
                <>
                    <span
                        className="absolute top-0 left-0 h-20 w-20 rounded-full border-2 border-success bg-success/15"
                        style={{
                            transform: `translate(-50%, -50%) scale(${0.3 + ripple * 1.6})`,
                            opacity: 1 - ripple,
                        }}
                    />
                    <span
                        className="absolute top-0 left-0 h-20 w-20 rounded-full border border-success/60"
                        style={{
                            transform: `translate(-50%, -50%) scale(${0.3 + ripple * 2.6})`,
                            opacity: (1 - ripple) * 0.7,
                        }}
                    />
                </>
            )}

            {touch ? (
                <span
                    className={`absolute top-0 left-0 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-text-primary/35 shadow-lg backdrop-blur-sm transition-transform duration-100 ${
                        pressed ? "scale-75" : "scale-100"
                    }`}
                />
            ) : (
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    className={`absolute -top-1 -left-1 drop-shadow-[0_4px_8px_rgb(0_0_0/0.35)] transition-transform duration-100 ${
                        pressed ? "scale-85" : "scale-100"
                    }`}
                >
                    <path
                        d="M4.5 3.2 19 10.4c.8.4.7 1.5-.1 1.8l-5.9 2-2.4 5.8c-.3.8-1.4.8-1.8 0L3.3 4.4c-.3-.8.4-1.5 1.2-1.2Z"
                        fill="#0f1c2e"
                        stroke="white"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                </svg>
            )}
        </div>
    );
}

function Caption({ t, moment }: { t: number; moment: number }) {
    return (
        <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pt-6 text-center sm:pt-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <Icon icon="solar:magic-stick-3-linear" className="h-4 w-4" />
                როგორ მუშაობს
            </p>

            <p
                key={moment}
                className="order-flow-caption mt-3 text-[clamp(1.375rem,6vw,3rem)] leading-tight font-bold text-text-primary"
            >
                {moments[moment].caption.map(line => (
                    <span key={line} className="block whitespace-nowrap">
                        {line}
                    </span>
                ))}
            </p>

            <p
                className={`mt-3 inline-flex items-center gap-2 text-xs font-medium text-text-secondary transition-opacity duration-500 ${
                    t < 0.02 ? "opacity-100" : "opacity-0"
                }`}
            >
                <span className="order-flow-scroll-dot flex h-6 w-4 justify-center rounded-full border-2 border-text-secondary pt-1">
                    <span className="h-1.5 w-1 rounded-full bg-accent" />
                </span>
                გაიგე, რა ხდება შემდეგ
            </p>
        </div>
    );
}

function Progress({ t, moment }: { t: number; moment: number }) {
    return (
        <div className="relative mx-auto mb-5 flex w-full max-w-xs shrink-0 items-center gap-2 px-4 sm:mb-8">
            {moments.map((item, index) => {
                const start = item.from;
                const end = moments[index + 1]?.from ?? 1;
                const fill = clamp((t - start) / (end - start));

                return (
                    <span key={item.from} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                        <span
                            className={`absolute inset-y-0 left-0 rounded-full ${index === moment ? "bg-accent" : "bg-accent/60"}`}
                            style={{ width: `${fill * 100}%` }}
                        />
                    </span>
                );
            })}
        </div>
    );
}

function OrderCard({
    added,
    pressed,
    buttonRef,
}: {
    added: boolean;
    pressed: boolean;
    buttonRef: React.Ref<HTMLSpanElement>;
}) {
    return (
        <div
            className={`rounded-3xl border bg-surface p-5 shadow-[0_1.5rem_3rem_-1.25rem_rgb(15_28_46/0.35)] transition-colors duration-500 sm:p-6 ${
                added ? "border-success/40" : "border-border"
            }`}
        >
            <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Icon icon="solar:clipboard-add-bold-duotone" className="h-5 w-5 text-accent" />
                    ახალი შეკვეთა
                </p>
                <span
                    className={`rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success tabular-nums transition-all duration-300 ${
                        added ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    }`}
                >
                    #0149
                </span>
            </div>

            <div className="mt-5 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                    ნბ
                </span>
                <span className="min-w-0">
                    <span className="block truncate font-semibold text-text-primary">ნინო ბერიძე</span>
                    <span className="block text-sm text-text-secondary tabular-nums">599 12 34 56</span>
                </span>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                    <Icon icon="solar:wallet-bold-duotone" className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">ტყავის საფულე</span>
                    <span className="block text-xs text-text-secondary">1 ერთეული</span>
                </span>
                <span className="font-semibold text-text-primary tabular-nums">65 ₾</span>
            </div>

            <div className="mt-4 flex items-end justify-between">
                <span className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    გადახდილი · ბარათი
                </span>
                <span className="text-right">
                    <span className="block text-xs text-text-secondary">სულ, კურიერით</span>
                    <span className="text-2xl font-bold text-text-primary tabular-nums">72 ₾</span>
                </span>
            </div>

            <span
                ref={buttonRef}
                className={`mt-5 flex h-13 items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white transition-all duration-150 ${
                    added ? "bg-success-hover" : "bg-success shadow-lg shadow-success/30"
                } ${pressed ? "scale-95" : "scale-100"}`}
            >
                <Icon icon={added ? "solar:check-circle-bold" : "solar:add-circle-linear"} className="h-5 w-5" />
                {added ? "შეკვეთა დაემატა" : "შეკვეთის დამატება"}
            </span>
        </div>
    );
}

function ResultValue({ item, lit, grow }: { item: ResultItem; lit: boolean; grow: number }) {
    if (item.kind === "invoice") {
        return (
            <span
                key={lit ? "ready" : "waiting"}
                className={`inline-flex items-center gap-1.5 ${lit ? "order-flow-pop text-text-primary" : "text-text-secondary"}`}
            >
                <Icon icon="solar:qr-code-linear" className="h-5 w-5 shrink-0" />
                {lit ? "#0149 · PDF" : "-"}
            </span>
        );
    }

    if (item.kind === "stock") {
        return (
            <span className="flex items-baseline gap-1.5">
                <span className={lit ? "text-text-secondary line-through decoration-2" : ""}>18</span>
                {lit && (
                    <>
                        <Icon icon="solar:arrow-right-linear" className="h-4 w-4 self-center text-text-secondary" />
                        <span className="order-flow-pop text-warning">17</span>
                    </>
                )}
            </span>
        );
    }

    if (item.kind === "profit") {
        return <span className={lit ? "text-success" : "text-text-secondary"}>+{Math.round(37 * grow)} ₾</span>;
    }

    return (
        <span
            key={lit ? "shipped" : "processing"}
            className={`order-flow-pop inline-flex max-w-full items-center gap-1.5 rounded-xl px-2 py-0.5 text-sm sm:text-base ${
                lit ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
            }`}
        >
            <Icon icon={lit ? "solar:delivery-linear" : "solar:clock-circle-linear"} className="h-4 w-4 shrink-0" />
            <span className="truncate">{lit ? "გაგზავნილი" : "მუშავდება"}</span>
        </span>
    );
}

function ResultCard({
    ref,
    item,
    wide,
    lit,
    appear,
    grow,
}: {
    ref: React.Ref<HTMLDivElement>;
    item: ResultItem;
    wide: boolean;
    lit: boolean;
    appear: number;
    grow: number;
}) {
    const check = (
        <Icon
            icon="solar:check-circle-bold"
            className={`h-6 w-6 shrink-0 text-success transition-all duration-300 ${lit ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
        />
    );

    const icon = (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
            <Icon icon={item.icon} className="h-6 w-6" />
        </span>
    );

    return (
        <div
            ref={ref}
            className={`rounded-2xl border bg-surface ${lit ? `${item.ring} shadow-xl` : "border-border"} ${
                wide ? "flex items-center gap-4 p-4" : "flex min-w-0 flex-col gap-2 p-3"
            }`}
            style={{
                opacity: appear * (lit ? 1 : 0.55),
                transform: `translateY(${(1 - appear) * 16}px) scale(${lit ? 1 : 0.97})`,
                transition: "opacity 0.2s, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.5s, box-shadow 0.5s",
            }}
        >
            {wide ? (
                <>
                    {icon}
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-secondary">{item.label}</span>
                        <span className="mt-0.5 block text-2xl font-bold text-text-primary tabular-nums">
                            <ResultValue item={item} lit={lit} grow={grow} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-secondary">{item.caption}</span>
                    </span>
                    {check}
                </>
            ) : (
                <>
                    <span className="flex items-start justify-between gap-2">
                        {icon}
                        {check}
                    </span>
                    <span className="line-clamp-2 text-xs leading-snug font-medium text-text-secondary">{item.label}</span>
                    <span className="block text-lg font-bold text-text-primary tabular-nums">
                        <ResultValue item={item} lit={lit} grow={grow} />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-snug text-text-secondary">{item.caption}</span>
                </>
            )}
        </div>
    );
}

function Summary({ count }: { count: number }) {
    const tiles = [
        { label: "სულ გაყიდვები", value: money(7120 + 65 * count), delta: "+65 ₾", deltaTone: "bg-success/10 text-success", icon: "solar:cart-large-2-bold-duotone", tone: "bg-accent/10 text-accent" },
        { label: "სუფთა მოგება", value: money(2705 + 37 * count), delta: "+37 ₾", deltaTone: "bg-success/10 text-success", icon: "solar:graph-up-bold-duotone", tone: "bg-success/10 text-success" },
        { label: "შეკვეთები", value: String(Math.round(148 + count)), delta: "+1", deltaTone: "bg-success/10 text-success", icon: "solar:clipboard-list-bold-duotone", tone: "bg-accent/10 text-accent" },
        { label: "მარაგში", value: String(Math.round(612 - count)), delta: "−1", deltaTone: "bg-warning/10 text-warning", icon: "solar:box-bold-duotone", tone: "bg-warning/10 text-warning" },
    ];

    return (
        <SummaryFrame>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {tiles.map(tile => (
                    <div key={tile.label} className="min-w-0 rounded-2xl border border-border bg-background p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tile.tone}`}>
                                <Icon icon={tile.icon} className="h-5 w-5" />
                            </span>
                            <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tile.deltaTone}`}
                                style={{ opacity: count, transform: `scale(${0.8 + count * 0.2})` }}
                            >
                                {tile.delta}
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-text-secondary sm:text-sm">{tile.label}</p>
                        <p className="truncate text-xl font-bold text-text-primary tabular-nums sm:text-3xl">{tile.value}</p>
                    </div>
                ))}
            </div>
        </SummaryFrame>
    );
}

function SummaryFrame({ children }: { children: ReactNode }) {
    return (
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_2rem_4rem_-1.5rem_rgb(15_28_46/0.4)]">
            <div className="flex h-12 items-center justify-between gap-3 bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-5">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                    <Icon icon="solar:home-2-bold-duotone" className="h-5 w-5" />
                    მთავარი
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    განახლებული მონაცემი
                </span>
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </div>
    );
}
