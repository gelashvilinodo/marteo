"use client";

import { useEffect, useRef, useState } from "react";

// რიცხვი ახალ მნიშვნელობამდე თვლით მიდის (თვიური/წლიური ფასი). სერვერზე და პირველ ჩატვირთვაზე პირდაპირ საბოლოო რიცხვია.
// prefers-reduced-motion-ზე მოძრაობა არ არის: ახალი რიცხვი მაშინვე ჩანს.
const DURATION = 550;

export default function AnimatedNumber({ value, className }: { value: number; className?: string }) {
    const [shown, setShown] = useState(value);
    const current = useRef(value);

    useEffect(() => {
        const from = current.current;
        if (from === value) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const start = performance.now();
        let frame = requestAnimationFrame(function step(now) {
            const t = reduced ? 1 : Math.min(1, (now - start) / DURATION);
            const eased = 1 - Math.pow(1 - t, 3);
            const next = t === 1 ? value : Math.round(from + (value - from) * eased);
            current.current = next;
            setShown(next);
            if (t < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [value]);

    return <span className={`tabular-nums ${className ?? ""}`}>{shown}</span>;
}
