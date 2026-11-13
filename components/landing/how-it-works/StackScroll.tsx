"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CoveredContext } from "./Player";

// ორი სექცია ერთმანეთზე: პირველი ადგილზე რჩება (sticky), მეორე ზემოდან ეფარება.
// დაფარვისას პირველი პატარავდება, უკან იხრება და ბუნდოვანდება — თითქოს ეკრანს შორდება.

const HEADER = 64;

export default function StackScroll({ back, front }: { back: ReactNode; front: ReactNode }) {
    const backRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const frontRef = useRef<HTMLDivElement>(null);
    const [covered, setCovered] = useState(false);

    useEffect(() => {
        const backEl = backRef.current;
        const inner = innerRef.current;
        const frontEl = frontRef.current;
        if (!backEl || !inner || !frontEl) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let frame = 0;

        function update() {
            frame = 0;
            if (!backEl || !inner || !frontEl) return;

            const vh = window.innerHeight;
            const height = backEl.offsetHeight;
            // გრძელი სექცია მაშინ ჩერდება, როცა მისი ქვედა კიდე ეკრანის ქვედა კიდეს მიაღწევს.
            const top = Math.min(HEADER, vh - height);
            backEl.style.top = `${top}px`;

            const p = Math.min(Math.max((vh - frontEl.getBoundingClientRect().top) / (vh - HEADER), 0), 1);
            setCovered(p > 0.55);

            if (reduced) return;
            const center = (HEADER + vh) / 2 - top;
            inner.style.transformOrigin = `50% ${center}px`;
            inner.style.transform = p > 0 ? `perspective(1400px) rotateX(${p * 10}deg) scale(${1 - p * 0.16})` : "";
            inner.style.filter = p > 0.01 ? `blur(${(p * 8).toFixed(2)}px)` : "";
            inner.style.opacity = String(1 - p * 0.45);
        }

        function request() {
            if (!frame) frame = requestAnimationFrame(update);
        }

        update();
        window.addEventListener("scroll", request, { passive: true });
        window.addEventListener("resize", request);
        const observer = new ResizeObserver(request);
        observer.observe(backEl);

        return () => {
            window.removeEventListener("scroll", request);
            window.removeEventListener("resize", request);
            observer.disconnect();
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <div className="relative">
            <div ref={backRef} className="sticky z-0" style={{ top: HEADER }}>
                <div ref={innerRef} className="will-change-[transform,filter]">
                    <CoveredContext.Provider value={covered}>{back}</CoveredContext.Provider>
                </div>
            </div>
            <div ref={frontRef} className="relative z-10">
                {front}
            </div>
        </div>
    );
}
