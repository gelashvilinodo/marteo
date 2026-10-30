"use client";

import { useEffect, useState } from "react";

export type KeyboardViewport = { open: boolean; top: number; height: number };

const closed: KeyboardViewport = { open: false, top: 0, height: 0 };

// On phones the on-screen keyboard shrinks only the visual viewport and iOS
// scrolls the page to keep the field visible, pushing headers off screen.
// While the keyboard is open the chat pins itself to the visible area instead.
//
// Newer iOS versions shrink window.innerHeight together with the keyboard in
// the installed web app, so the keyboard is detected against the tallest
// viewport seen while no keyboard was open, not against innerHeight.
export function useKeyboardViewport(): KeyboardViewport {
    const [state, setState] = useState(closed);
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const phone = window.matchMedia("(max-width: 1023px) and (pointer: coarse)");
        let baseline = Math.max(viewport.height, window.innerHeight);
        let frame = 0;
        const editing = () => {
            const active = document.activeElement;
            return active instanceof HTMLTextAreaElement ||
                (active instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "file"].includes(active.type)) ||
                (active instanceof HTMLElement && active.isContentEditable);
        };
        const measure = () => {
            frame = 0;
            const height = viewport.height;
            if (!editing()) baseline = Math.max(height, window.innerHeight);
            else baseline = Math.max(baseline, height);
            const open = phone.matches && editing() && baseline - height > 120;
            setState(current => {
                if (!open) return current.open ? closed : current;
                const next = { open, top: Math.round(viewport.offsetTop), height: Math.round(height) };
                return current.open && current.top === next.top && current.height === next.height ? current : next;
            });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
        // Rotating the phone changes the full height; start over.
        const reset = () => { baseline = 0; schedule(); };
        viewport.addEventListener("resize", schedule);
        viewport.addEventListener("scroll", schedule);
        window.addEventListener("orientationchange", reset);
        document.addEventListener("focusin", schedule);
        document.addEventListener("focusout", schedule);
        measure();
        return () => {
            viewport.removeEventListener("resize", schedule);
            viewport.removeEventListener("scroll", schedule);
            window.removeEventListener("orientationchange", reset);
            document.removeEventListener("focusin", schedule);
            document.removeEventListener("focusout", schedule);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);
    return state;
}
