"use client";

import { useEffect, useState } from "react";

export type KeyboardViewport = { open: boolean; top: number; height: number };

const closed: KeyboardViewport = { open: false, top: 0, height: 0 };

// On phones the on-screen keyboard shrinks only the visual viewport and iOS
// scrolls the page to keep the field visible, pushing headers off screen.
// While the keyboard is open the chat pins itself to the visible area instead.
export function useKeyboardViewport(): KeyboardViewport {
    const [state, setState] = useState(closed);
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const phone = window.matchMedia("(max-width: 1023px) and (pointer: coarse)");
        let frame = 0;
        const measure = () => {
            frame = 0;
            const open = phone.matches && window.innerHeight - viewport.height > 120;
            setState(current => {
                if (!open) return current.open ? closed : current;
                const next = { open, top: Math.round(viewport.offsetTop), height: Math.round(viewport.height) };
                return current.open && current.top === next.top && current.height === next.height ? current : next;
            });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
        viewport.addEventListener("resize", schedule);
        viewport.addEventListener("scroll", schedule);
        measure();
        return () => {
            viewport.removeEventListener("resize", schedule);
            viewport.removeEventListener("scroll", schedule);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);
    return state;
}
