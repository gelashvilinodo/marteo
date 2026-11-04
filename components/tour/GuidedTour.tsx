"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";

export type TourStep = {
    // ელემენტის data-tour მნიშვნელობა; თუ გვერდზე არ ჩანს, ნაბიჯი გამოიტოვება.
    // გარეშე ბარათი ეკრანის შუაში ჩნდება და არაფერზე მიუთითებს.
    target?: string;
    title: string;
    body: string;
    // მხოლოდ შუაში მდგარ ბარათზე ჩანს.
    icon?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 14;
const MARGIN = 16;

function findTarget(target: string) {
    const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? element : null;
}

function sameRect(a: Rect | null, b: Rect) {
    return a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

export default function GuidedTour({
    steps,
    open,
    onClose,
}: {
    steps: TourStep[];
    open: boolean;
    // completed: ბოლომდე გაიარა თუ შუაში დახურა.
    onClose: (completed: boolean) => void;
}) {
    const [active, setActive] = useState<TourStep[]>([]);
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [card, setCard] = useState<{ top: number; left: number; arrow: number; below: boolean } | null>(null);
    // პირველად ბარათი ადგილზე უბრალოდ ჩნდება; შემდეგ ნაბიჯებზე კი გადაადგილდება.
    const [moving, setMoving] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const nextRef = useRef<HTMLButtonElement>(null);

    // გახსნისას მხოლოდ ის ნაბიჯები რჩება, რომელთა ელემენტიც ახლა ჩანს.
    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => {
            const visible = steps.filter(step => !step.target || findTarget(step.target));
            if (!visible.length) {
                onClose(true);
                return;
            }
            setActive(visible);
            setIndex(0);
            setRect(null);
            setCard(null);
            setMoving(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [open, steps, onClose]);

    useEffect(() => {
        if (!card || moving) return;
        const frame = requestAnimationFrame(() => setMoving(true));
        return () => cancelAnimationFrame(frame);
    }, [card, moving]);

    const step = open ? active[index] : undefined;

    useEffect(() => {
        if (!step) return;
        nextRef.current?.focus({ preventScroll: true });
        const target = step.target;
        if (!target) {
            // შემდეგი მიმთითებელი ბარათი ადგილზე უნდა გამოჩნდეს და არა შუიდან გადმოცურდეს.
            const frame = requestAnimationFrame(() => { setRect(null); setCard(null); setMoving(false); });
            return () => cancelAnimationFrame(frame);
        }
        findTarget(target)?.scrollIntoView({ block: "center", behavior: "smooth" });
        // სქროლის, ზომის შეცვლისა და გვერდის ცვლილებისას ხვრელი ელემენტს მიჰყვება.
        let frame = 0;
        const track = () => {
            const element = findTarget(target);
            if (element) {
                const box = element.getBoundingClientRect();
                const next = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
                setRect(current => (sameRect(current, next) ? current : next));
            }
            frame = requestAnimationFrame(track);
        };
        track();
        return () => cancelAnimationFrame(frame);
    }, [step]);

    useLayoutEffect(() => {
        const element = cardRef.current;
        if (!rect || !element) return;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const below = rect.top + rect.height + GAP + height <= viewportHeight - MARGIN || rect.top - GAP - height < MARGIN;
        const top = below
            ? Math.min(rect.top + rect.height + GAP, viewportHeight - height - MARGIN)
            : rect.top - GAP - height;
        const center = rect.left + rect.width / 2;
        const left = Math.min(Math.max(center - width / 2, MARGIN), viewportWidth - width - MARGIN);
        const arrow = Math.min(Math.max(center - left, 24), width - 24);
        setCard(current =>
            current && current.top === top && current.left === left && current.arrow === arrow && current.below === below
                ? current
                : { top, left, arrow, below },
        );
    }, [rect, index]);

    const finish = useCallback((completed: boolean) => {
        setActive([]);
        setRect(null);
        setCard(null);
        onClose(completed);
    }, [onClose]);

    const next = useCallback(() => {
        if (index >= active.length - 1) finish(true);
        else setIndex(index + 1);
    }, [index, active.length, finish]);

    const previous = useCallback(() => setIndex(current => Math.max(current - 1, 0)), []);

    useEffect(() => {
        if (!step) return;
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") finish(false);
            else if (event.key === "ArrowRight") next();
            else if (event.key === "ArrowLeft") previous();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [step, finish, next, previous]);

    if (!step) return null;
    const last = index === active.length - 1;
    const centered = !step.target;

    return createPortal(
        <div className="fixed inset-0 z-[1100]" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title" aria-describedby="guided-tour-body">
            {/* ეკრანის დანარჩენ ნაწილს ბლოკავს, მათ შორის მონიშნულ ელემენტსაც: ტური მხოლოდ ხსნის. */}
            <div className={`absolute inset-0 motion-safe:transition-colors motion-safe:duration-300 ${centered ? "bg-black/70" : ""}`} />
            {rect && !centered && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none fixed rounded-2xl ring-2 ring-white/70 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out"
                    style={{ ...rect, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.7)" }}
                />
            )}
            <div
                ref={cardRef}
                className={`fixed ${centered ? "w-[min(28rem,calc(100vw-2rem))]" : "w-[min(22rem,calc(100vw-2rem))]"} rounded-2xl border border-border bg-surface p-5 shadow-2xl motion-safe:duration-300 motion-safe:ease-out ${moving ? "motion-safe:transition-[top,left,opacity]" : "motion-safe:transition-opacity"}`}
                style={centered ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } : card ? { top: card.top, left: card.left } : { top: 0, left: 0, opacity: 0 }}
            >
                {centered && step.icon && (
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Icon icon={step.icon} className="h-6 w-6" aria-hidden="true" />
                    </span>
                )}
                {card && !centered && (
                    <span
                        aria-hidden="true"
                        className={`absolute h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-border bg-surface ${card.below ? "-top-[7.5px] border-l border-t" : "-bottom-[7.5px] border-b border-r"}`}
                        style={{ left: card.arrow }}
                    />
                )}
                <div className="flex items-start justify-between gap-3">
                    <h2 id="guided-tour-title" className="text-base font-semibold text-text-primary">{step.title}</h2>
                    <span className="shrink-0 pt-0.5 text-xs tabular-nums text-text-secondary">{index + 1}/{active.length}</span>
                </div>
                <p id="guided-tour-body" aria-live="polite" className="mt-2 text-sm leading-relaxed text-text-secondary">{step.body}</p>
                <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
                    {active.map((item, dot) => (
                        <span
                            key={dot}
                            className={`h-1.5 rounded-full motion-safe:transition-all ${dot === index ? "w-5 bg-accent" : "w-1.5 bg-border"}`}
                        />
                    ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => finish(false)} className="mr-auto min-h-10 rounded-xl px-2 text-sm text-text-secondary hover:text-text-primary">
                        გამოტოვება
                    </button>
                    {index > 0 && (
                        <button type="button" onClick={previous} className="min-h-10 rounded-xl border border-border px-4 text-sm font-medium text-text-primary hover:bg-background">
                            წინა
                        </button>
                    )}
                    <button ref={nextRef} type="button" onClick={next} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
                        {last ? "დასრულება" : "შემდეგი"}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
