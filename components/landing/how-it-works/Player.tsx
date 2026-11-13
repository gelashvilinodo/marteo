"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/shared/Icon";
import { VIEWPORT, clamp, easeHand, easeInOut, type BaseTimes, type DemoDates, type Mode, type Script } from "./engine";

// ლენდინგის დემოს საერთო ფლეიერი: დეშბორდის HTML ასლი, რომელიც თავისით თამაშობს.
// აპი ფიქსირებულ ვირტუალურ ზომაზეა დახატული (დესკტოპი 1400×860, ტელეფონი 390×720)
// და მთლიანად პატარავდება კონტეინერში — ასე კურსორის და კამერის კოორდინატები ყოველთვის ზუსტია.

// როცა სექციას სხვა სექცია ეფარება (StackScroll), დემო ჩერდება.
export const CoveredContext = createContext(false);

const MOBILE_BELOW = 640;
const MOBILE_FRAME = 400;

function formatDate(date: Date, withYear = true) {
    const d = String(date.getDate()).padStart(2, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    return withYear ? `${d}.${mo}.${date.getFullYear()}` : `${d}.${mo}`;
}

function makeDates(): DemoDates {
    const today = new Date();
    const shift = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
    return {
        period: `${formatDate(shift(29))} - ${formatDate(today)}`,
        today: formatDate(today),
        last10: Array.from({ length: 10 }, (_, index) => formatDate(shift(9 - index), false)),
        last7: Array.from({ length: 7 }, (_, index) => String(shift(6 - index).getDate()).padStart(2, "0")),
    };
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(callback: () => void) {
    const query = window.matchMedia(MOTION_QUERY);
    query.addEventListener("change", callback);
    return () => query.removeEventListener("change", callback);
}

function subscribeNothing() {
    return () => {};
}

const fallbackDates: DemoDates = {
    period: "",
    today: "",
    last10: Array.from({ length: 10 }, () => ""),
    last7: Array.from({ length: 7 }, () => ""),
};

type PlayerProps<T extends BaseTimes> = {
    id: string;
    eyebrow: { icon: string; label: string };
    title: string;
    subtitle: string;
    buildScript: (mode: Mode) => Script<T>;
    render: (t: number, script: Script<T>, dates: DemoDates) => ReactNode;
    className?: string;
};

export function DemoPlayer<T extends BaseTimes>({ id, eyebrow, title, subtitle, buildScript, render, className = "" }: PlayerProps<T>) {
    const covered = useContext(CoveredContext);
    const boxRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const mode: Mode = width > 0 && width < MOBILE_BELOW ? "mobile" : "desktop";
    const script = useMemo(() => buildScript(mode), [mode, buildScript]);
    const duration = script.T.duration;

    const [rawT, setT] = useState(0);
    // რეჟიმის შეცვლისას (დესკტოპი ↔ ტელეფონი) დრო ახალ ხანგრძლივობაში რჩება.
    const t = Math.min(rawT, duration - 0.01);
    const [playing, setPlaying] = useState(false);
    const [visible, setVisible] = useState(false);
    const started = useRef(false);

    const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_QUERY).matches, () => false);
    // თარიღები მხოლოდ ბრაუზერში ითვლება, რომ სერვერის და კლიენტის HTML ერთმანეთს დაემთხვეს.
    const todayKey = useSyncExternalStore(subscribeNothing, () => new Date().toDateString(), () => "");
    const dates = useMemo(() => (todayKey ? makeDates() : fallbackDates), [todayKey]);

    // სიგანე გარე კონტეინრიდან იზომება: ტელეფონის რეჟიმში თვითონ ჩარჩო ვიწროვდება.
    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const observer = new ResizeObserver(() => setWidth(wrap.clientWidth));
        observer.observe(wrap);
        return () => observer.disconnect();
    }, []);

    // ეკრანზე გამოჩენისას იწყება, გასვლისას ჩერდება.
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (visible && !started.current && !reduced) {
            started.current = true;
            setPlaying(true);
        }
    }, [visible, reduced]);

    const active = visible && !covered;

    useEffect(() => {
        if (!playing || !active) return;
        let frame = 0;
        let last = performance.now();

        function tick(now: number) {
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            if (!document.hidden) {
                setT(current => {
                    const next = Math.min(current, duration - 0.01) + dt;
                    return next >= duration ? 0 : Math.round(next * 1000) / 1000;
                });
            }
            frame = requestAnimationFrame(tick);
        }

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, active, duration]);

    const chapterIndex = script.chapters.reduce((found, chapter, index) => (t >= chapter.from ? index : found), 0);
    const chapter = script.chapters[chapterIndex];

    const jump = useCallback(
        (index: number) => {
            const target = script.chapters[index];
            const next = script.chapters[index + 1]?.from ?? script.T.end;
            // მოძრაობის გარეშე რეჟიმში თავის შედეგს ვაჩვენებთ, სხვა შემთხვევაში თავიდან ვთამაშობთ.
            setT(reduced ? Math.max(target.from, next - 0.3) : target.from + 0.01);
            if (!reduced) setPlaying(true);
        },
        [script, reduced],
    );

    const view = VIEWPORT[mode];
    const scale = width ? Math.min(width, mode === "mobile" ? MOBILE_FRAME : width) / view.w : 0;

    return (
        <section id={id} aria-labelledby={`${id}-title`} className={`relative bg-background py-16 sm:py-24 ${className}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--marteo-accent)_10%,transparent),transparent_60%)]" />

            <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                        <Icon icon={eyebrow.icon} className="h-4 w-4" />
                        {eyebrow.label}
                    </p>
                    <h2 id={`${id}-title`} className="mt-4 text-[clamp(1.75rem,5vw,3rem)] leading-tight font-bold text-balance text-text-primary">
                        {title}
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-text-secondary sm:text-lg">{subtitle}</p>
                </div>

                <ol className="sr-only">
                    {script.chapters.map(item => (
                        <li key={item.id}>{item.label}: {item.caption}</li>
                    ))}
                </ol>

                <div ref={wrapRef} className="mx-auto mt-10 max-w-6xl sm:mt-12">
                    <Chapters script={script} t={t} index={chapterIndex} onJump={jump} playing={playing} onToggle={() => setPlaying(value => !value)} />

                    <p key={chapter.id} className="demo-caption mx-auto mt-4 min-h-[3em] max-w-2xl text-center text-[15px] leading-snug font-medium text-text-primary sm:min-h-[1.6em] sm:text-lg">
                        {chapter.caption}
                    </p>

                    <div
                        ref={boxRef}
                        className={`relative mx-auto mt-5 w-full overflow-hidden border border-border bg-background shadow-[0_2rem_5rem_-1.5rem_rgb(2_8_23/0.45)] ring-4 ring-accent/5 select-none ${
                            mode === "mobile" ? "max-w-[400px] rounded-[2rem]" : "rounded-2xl sm:rounded-3xl"
                        }`}
                        style={{ height: scale ? view.h * scale : undefined, aspectRatio: scale ? undefined : `${VIEWPORT.desktop.w} / ${VIEWPORT.desktop.h}` }}
                        aria-hidden="true"
                    >
                        {scale > 0 && <Stage script={script} t={t} scale={scale}>{render(t, script, dates)}</Stage>}

                        {!playing && (
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setPlaying(true)}
                                className="absolute inset-0 z-[60] flex items-center justify-center bg-[rgb(2_8_23/0.25)] transition-colors hover:bg-[rgb(2_8_23/0.35)]"
                            >
                                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-xl shadow-success/30">
                                    <Icon icon="solar:play-bold" className="ml-1 h-7 w-7" />
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function Chapters({
    script,
    t,
    index,
    onJump,
    playing,
    onToggle,
}: {
    script: Script<BaseTimes>;
    t: number;
    index: number;
    onJump: (index: number) => void;
    playing: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="flex items-center gap-2 sm:gap-3">
            <button
                type="button"
                onClick={onToggle}
                aria-label={playing ? "პაუზა" : "გაშვება"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
                <Icon icon={playing ? "solar:pause-bold" : "solar:play-bold"} className="h-5 w-5" />
            </button>

            <div className="grid min-w-0 flex-1 gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${script.chapters.length}, minmax(0, 1fr))` }}>
                {script.chapters.map((item, i) => {
                    const end = script.chapters[i + 1]?.from ?? script.T.end;
                    const fill = clamp((t - item.from) / (end - item.from));
                    const active = i === index;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onJump(i)}
                            aria-label={`${i + 1}. ${item.label}`}
                            aria-current={active ? "step" : undefined}
                            className="group flex min-w-0 flex-col gap-2 rounded-lg py-1 text-left"
                        >
                            <span
                                className={`hidden truncate text-xs font-semibold transition-colors sm:block lg:text-sm ${
                                    active ? "text-accent" : i < index ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                                }`}
                            >
                                <span className="tabular-nums opacity-60">{i + 1}.</span> {item.label}
                            </span>
                            <span className="relative h-1.5 overflow-hidden rounded-full bg-border">
                                <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${fill * 100}%` }} />
                            </span>
                        </button>
                    );
                })}
            </div>

            <span className="shrink-0 text-xs font-semibold text-accent sm:hidden">
                {index + 1}/{script.chapters.length} · {script.chapters[index].label}
            </span>
        </div>
    );
}

function Stage({ script, t, scale, children }: { script: Script<BaseTimes>; t: number; scale: number; children: ReactNode }) {
    const m = script.mode === "mobile";
    const view = VIEWPORT[script.mode];

    const cameraRef = useRef<HTMLDivElement>(null);
    const pointerRef = useRef<HTMLDivElement>(null);
    const arrowRef = useRef<HTMLDivElement>(null);
    const rippleRef = useRef<HTMLSpanElement>(null);
    const lastPositions = useRef<Record<string, { x: number; y: number }>>({});

    // კამერა, სქროლი და კურსორი DOM-ზე პირდაპირ იწერება: ზომები რენდერის შემდეგ იზომება.
    useLayoutEffect(() => {
        const cam = cameraRef.current;
        if (!cam) return;

        applyScroll(cam, script, t);

        // ზომები ყოველ ჯერზე ახლად იკითხება, რომ კამერის ახალი მდგომარეობა გაითვალისწინოს.
        const rectOf = (name: string) => {
            const element = cam.querySelector<HTMLElement>(`[data-demo="${name}"]`);
            if (!element) return null;
            const camRect = cam.getBoundingClientRect();
            const factor = camRect.width / view.w;
            const rect = element.getBoundingClientRect();
            if (!rect.width || !factor) return null;
            return {
                x: (rect.left - camRect.left) / factor,
                y: (rect.top - camRect.top) / factor,
                w: rect.width / factor,
                h: rect.height / factor,
            };
        };

        const next = cameraAt(script, t, rectOf, view);
        cam.style.transform = `translate3d(${next.tx}px, ${next.ty}px, 0) scale(${next.s})`;

        const pointer = pointerAt(script, t, rectOf, lastPositions.current, view);
        const el = pointerRef.current;
        if (el) {
            el.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
            el.style.opacity = String(pointer.opacity);
        }
        if (arrowRef.current) arrowRef.current.style.transform = `scale(${pointer.press ? 0.86 : 1})`;
        if (rippleRef.current) {
            rippleRef.current.style.opacity = String(pointer.ripple > 0 ? (1 - pointer.ripple) * 0.9 : 0);
            rippleRef.current.style.transform = `translate(-50%, -50%) scale(${0.3 + pointer.ripple * 1.5})`;
        }
    });

    // ციკლის ბოლოს რბილი ჩაქრობა და დასაწყისში გამოჩენა.
    const fade = Math.min(clamp(t / 0.35), clamp((script.T.duration - t) / 0.45));

    return (
        <div
            className="absolute top-0 left-0 origin-top-left overflow-hidden"
            style={{ width: view.w, height: view.h, transform: `scale(${scale})`, opacity: fade }}
        >
            <div ref={cameraRef} className="absolute inset-0 origin-top-left will-change-transform">
                {children}
                <Pointer m={m} pointerRef={pointerRef} arrowRef={arrowRef} rippleRef={rippleRef} />
            </div>
        </div>
    );
}

// დიდი, ბრენდის ფერის კურსორი (დესკტოპი) ან თითის შეხების წრე (ტელეფონი).
function Pointer({
    m,
    pointerRef,
    arrowRef,
    rippleRef,
}: {
    m: boolean;
    pointerRef: React.Ref<HTMLDivElement>;
    arrowRef: React.Ref<HTMLDivElement>;
    rippleRef: React.Ref<HTMLSpanElement>;
}) {
    return (
        <div ref={pointerRef} className="pointer-events-none absolute top-0 left-0 z-[70]" style={{ opacity: 0 }}>
            <span
                ref={rippleRef}
                className={`absolute top-0 left-0 rounded-full border-[3px] border-accent bg-accent/20 ${m ? "h-24 w-24" : "h-20 w-20"}`}
                style={{ opacity: 0 }}
            />
            {m ? (
                <div ref={arrowRef} className="absolute -top-7 -left-7 h-14 w-14 rounded-full border-[3px] border-white bg-accent/45 shadow-[0_6px_20px_rgb(2_8_23/0.4)] backdrop-blur-[2px] transition-transform duration-100" />
            ) : (
                <div ref={arrowRef} className="absolute -top-1 -left-1 origin-top-left transition-transform duration-100">
                    <svg width="42" height="42" viewBox="0 0 24 24" className="drop-shadow-[0_6px_10px_rgb(2_8_23/0.45)]">
                        <defs>
                            <linearGradient id="demo-cursor" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#7aa6ff" />
                                <stop offset="1" stopColor="#3d6fd6" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M4.4 2.9 19.6 10.3c.9.4.8 1.7-.1 2l-6.1 2.1-2.5 6c-.4.9-1.6.9-2 0L2.9 4.4c-.4-.9.6-1.9 1.5-1.5Z"
                            fill="url(#demo-cursor)"
                            stroke="white"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            )}
        </div>
    );
}

type Rect = { x: number; y: number; w: number; h: number };
type RectOf = (name: string) => Rect | null;

function keyIndex<T extends { t: number }>(keys: T[], t: number) {
    let index = 0;
    keys.forEach((key, i) => {
        if (t >= key.t) index = i;
    });
    return index;
}

function applyScroll(cam: HTMLElement, script: Script<BaseTimes>, t: number) {
    const containers = cam.querySelectorAll<HTMLElement>("[data-demo-scroll]");
    const container = containers[containers.length - 1];
    const content = container?.querySelector<HTMLElement>("[data-demo-scroll-content]");
    if (!container || !content) return;

    const max = Math.max(0, content.scrollHeight - container.clientHeight);
    const valueOf = (target: string | null, offset = 0) => {
        if (!target) return 0;
        const element = content.querySelector<HTMLElement>(`[data-demo="${target}"]`);
        if (!element) return 0;
        let y = 0;
        let node: HTMLElement | null = element;
        while (node && node !== content) {
            y += node.offsetTop;
            node = node.offsetParent as HTMLElement | null;
            if (node && !content.contains(node)) break;
        }
        return clamp(y - offset, 0, max);
    };

    const keys = script.scroll;
    const index = keyIndex(keys, t);
    const key = keys[index];
    const previous = keys[index - 1];
    const to = valueOf(key.target, key.offset);
    const from = previous && key.dur > 0 ? valueOf(previous.target, previous.offset) : to;
    const k = key.dur > 0 ? easeInOut(clamp((t - key.t) / key.dur)) : 1;

    content.style.transform = `translate3d(0, ${-(from + (to - from) * k)}px, 0)`;
}

function cameraAt(script: Script<BaseTimes>, t: number, rectOf: RectOf, view: { w: number; h: number }) {
    const keys = script.camera;
    const index = keyIndex(keys, t);
    const focus = (key: (typeof keys)[number]) => {
        const rect = key.target ? rectOf(key.target) : null;
        if (!rect) return { x: view.w / 2, y: view.h / 2, s: 1 };
        return { x: rect.x + rect.w / 2, y: rect.y + rect.h * (key.anchorY ?? 0.5), s: key.scale };
    };

    const key = keys[index];
    const to = focus(key);
    const from = index > 0 ? focus(keys[index - 1]) : to;
    const k = key.dur > 0 ? easeInOut(clamp((t - key.t) / key.dur)) : 1;

    const s = from.s + (to.s - from.s) * k;
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k;

    return {
        s,
        tx: clamp(view.w / 2 - x * s, view.w - view.w * s, 0),
        ty: clamp(view.h / 2 - y * s, view.h - view.h * s, 0),
    };
}

function pointerAt(script: Script<BaseTimes>, t: number, rectOf: RectOf, cache: Record<string, { x: number; y: number }>, view: { w: number; h: number }) {
    const m = script.mode === "mobile";
    const point = (name: string) => {
        const rect = rectOf(name);
        if (rect) {
            // კურსორი ღილაკის ცენტრს ოდნავ მარჯვნივ და ქვემოთ ეხება, როგორც ადამიანი.
            cache[name] = { x: rect.x + Math.min(rect.w * 0.55, rect.w - 8), y: rect.y + rect.h * 0.58 };
        }
        return cache[name] ?? { x: view.w * 0.6, y: view.h * 0.7 };
    };

    const clicks = script.clicks;
    const nearest = clicks.reduce<{ ripple: number; press: boolean }>(
        (state, click) => {
            const d = t - click.t;
            return {
                ripple: d >= 0 && d < 0.55 ? d / 0.55 : state.ripple,
                press: state.press || (d >= -0.05 && d < 0.14),
            };
        },
        { ripple: 0, press: false },
    );

    if (m) {
        // ტელეფონზე კურსორი არ მოძრაობს: თითი ჩნდება, აჭერს და ქრება.
        const active = clicks.find(click => t >= click.t - 0.35 && t < click.t + 0.45);
        if (!active) return { x: -100, y: -100, opacity: 0, ripple: 0, press: false };
        const position = point(active.target);
        const opacity = Math.min(clamp((t - (active.t - 0.35)) / 0.18), clamp((active.t + 0.45 - t) / 0.2));
        return { ...position, opacity, ...nearest };
    }

    const start = { x: view.w * 0.72, y: view.h * 0.86 };
    let from = start;
    let position = start;

    for (let i = 0; i < clicks.length; i += 1) {
        const click = clicks[i];
        const arrive = click.t - 0.12;
        const depart = arrive - click.move;
        if (t < depart) break;

        const target = point(click.target);
        if (t >= arrive) {
            position = target;
            from = target;
            continue;
        }

        const k = easeHand(clamp((t - depart) / click.move));
        const dx = target.x - from.x;
        const dy = target.y - from.y;
        const bend = (i % 2 === 0 ? 1 : -1) * 0.16;
        const cx = (from.x + target.x) / 2 - dy * bend;
        const cy = (from.y + target.y) / 2 + dx * bend;
        position = {
            x: (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * cx + k * k * target.x,
            y: (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * cy + k * k * target.y,
        };
        break;
    }

    // სცენარში მითითებულ მონაკვეთებში კურსორი რბილად ქრება.
    const away = (script.hide ?? []).reduce((value, [from, to]) => Math.min(value, Math.min(clamp((from - t) / 0.3) + clamp((t - to) / 0.3), 1)), 1);
    const opacity = Math.min(clamp((t - 0.3) / 0.4), clamp((script.T.end + 0.6 - t) / 0.6), away);
    return { ...position, opacity, ...nearest };
}
