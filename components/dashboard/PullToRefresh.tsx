"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";

// რამდენი პიქსელი უნდა ჩამოიწიოს, რომ წრე შეიკრას.
const THRESHOLD = 72;
const MAX_PULL = 120;
const INDICATOR_SIZE = 52;
const RING_RADIUS = 24;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

type Phase = "idle" | "pulling" | "releasing" | "refreshing";

// ბრაუზერებს თავიანთი ჩამოწევით განახლება აქვთ - ჩვენი მხოლოდ ტელეფონზე დაინსტალირებულ აპში ჩაირთვება.
function isInstalledPhoneApp() {
    const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

    return standalone && window.matchMedia("(pointer: coarse)").matches;
}

// შიდა სქროლიან ბლოკში (ცხრილი, სია) ჩამოწევა მის სქროლს ეკუთვნის.
function startsInScrolledArea(target: EventTarget | null) {
    for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
        if (node.scrollTop > 0) {
            return true;
        }
    }

    return false;
}

function canStartPull(event: TouchEvent) {
    return (
        event.touches.length === 1 &&
        window.scrollY <= 0 &&
        isInstalledPhoneApp() &&
        document.body.style.overflow !== "hidden" &&
        !document.querySelector("dialog[open]") &&
        !startsInScrolledArea(event.target)
    );
}

export default function PullToRefresh({ children }: { children: ReactNode }) {
    const [pull, setPull] = useState(0);
    const [phase, setPhase] = useState<Phase>("idle");
    const startY = useRef<number | null>(null);
    const pullRef = useRef(0);
    const busy = useRef(false);

    useEffect(() => {
        let releaseTimer: number | undefined;

        function setPullDistance(distance: number, nextPhase: Phase) {
            pullRef.current = distance;
            setPull(distance);
            setPhase(nextPhase);
        }

        function onTouchStart(event: TouchEvent) {
            startY.current = !busy.current && canStartPull(event) ? event.touches[0].clientY : null;
        }

        function onTouchMove(event: TouchEvent) {
            if (startY.current === null) {
                return;
            }

            const distance = event.touches[0].clientY - startY.current;

            if (distance <= 0 || window.scrollY > 0) {
                if (pullRef.current === 0) {
                    startY.current = null;
                } else {
                    setPullDistance(0, "pulling");
                }
                return;
            }

            // iOS-ის „რეზინის“ სქროლს ვაჩერებთ, რომ მხოლოდ ჩვენი ანიმაცია ჩანდეს.
            event.preventDefault();

            const next = Math.min(MAX_PULL, distance * 0.5);

            if (pullRef.current < THRESHOLD && next >= THRESHOLD) {
                navigator.vibrate?.(10);
            }

            setPullDistance(next, "pulling");
        }

        function onTouchEnd() {
            if (startY.current === null) {
                return;
            }

            startY.current = null;

            if (pullRef.current >= THRESHOLD) {
                busy.current = true;
                setPullDistance(THRESHOLD, "refreshing");
                window.setTimeout(() => window.location.reload(), 450);
                return;
            }

            setPullDistance(0, "releasing");
            window.clearTimeout(releaseTimer);
            releaseTimer = window.setTimeout(() => setPhase("idle"), 300);
        }

        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onTouchEnd);
        window.addEventListener("touchcancel", onTouchEnd);

        return () => {
            window.clearTimeout(releaseTimer);
            window.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
            window.removeEventListener("touchcancel", onTouchEnd);
        };
    }, []);

    const progress = Math.min(pull / THRESHOLD, 1);
    const closed = progress >= 1;
    const refreshing = phase === "refreshing";
    const animated = phase === "releasing" || phase === "refreshing";

    return (
        <>
            {/* მუდმივად ჩატვირთულია, რომ ლოგო პირველივე ჩამოწევისას გამოჩნდეს. */}
            <div
                aria-hidden={!refreshing}
                role={refreshing ? "status" : undefined}
                className={[
                    "dashboard-pull-indicator pointer-events-none fixed inset-x-0 z-30 flex justify-center",
                    phase === "idle" ? "invisible" : "",
                ].join(" ")}
                style={{
                    transform: `translateY(${pull - INDICATOR_SIZE}px)`,
                    opacity: Math.min(1, pull / 32),
                    transition: animated ? "transform 280ms ease-out, opacity 280ms ease-out" : undefined,
                }}
            >
                <span className="sr-only">{refreshing ? "ახლდება" : ""}</span>
                <div
                    className={[
                        "relative flex items-center justify-center rounded-full border border-border bg-surface shadow-lg transition-transform duration-200",
                        closed ? "scale-110" : "scale-100",
                    ].join(" ")}
                    style={{ width: INDICATOR_SIZE, height: INDICATOR_SIZE }}
                >
                    <svg
                        viewBox="0 0 56 56"
                        className={[
                            "absolute inset-0 h-full w-full -rotate-90",
                            refreshing ? "motion-safe:animate-spin" : "",
                        ].join(" ")}
                    >
                        <circle cx="28" cy="28" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-border" />
                        <circle
                            cx="28"
                            cy="28"
                            r={RING_RADIUS}
                            fill="none"
                            strokeWidth="3"
                            strokeLinecap="round"
                            className="stroke-accent"
                            strokeDasharray={RING_LENGTH}
                            strokeDashoffset={refreshing ? RING_LENGTH * 0.7 : RING_LENGTH * (1 - progress)}
                        />
                    </svg>
                    <Image
                        src="/images/marteo-11.svg"
                        alt=""
                        width={28}
                        height={28}
                        loading="eager"
                        className="h-7 w-7 dark:hidden"
                    />
                    <Image
                        src="/images/marteo-12.svg"
                        alt=""
                        width={28}
                        height={28}
                        loading="eager"
                        className="hidden h-7 w-7 dark:block"
                    />
                </div>
            </div>

            <div
                style={
                    phase === "idle"
                        ? undefined
                        : {
                              transform: `translateY(${pull}px)`,
                              transition: animated ? "transform 280ms ease-out" : undefined,
                          }
                }
            >
                {children}
            </div>
        </>
    );
}
