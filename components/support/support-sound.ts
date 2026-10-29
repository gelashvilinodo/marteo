"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "marteo-support-sound";
let context: AudioContext | null = null;
const listeners = new Set<() => void>();

// Browsers allow audio only after a user gesture; unlock on the first one.
if (typeof window !== "undefined") {
    const unlock = () => {
        context ??= new AudioContext();
        void context.resume();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
}

export function isSupportSoundOn() {
    try { return localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
}

export function setSupportSound(on: boolean) {
    try { localStorage.setItem(STORAGE_KEY, on ? "on" : "off"); } catch { /* Preference stays for this page only. */ }
    listeners.forEach(listener => listener());
}

export function useSupportSound() {
    return useSyncExternalStore(
        listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        isSupportSoundOn,
        () => true,
    );
}

// A soft two-note chime, synthesized so no audio file is shipped.
export function playSupportChime() {
    if (!context || context.state !== "running" || !isSupportSoundOn()) return;
    const start = context.currentTime;
    for (const [index, frequency] of [880, 1318.5].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + index * 0.12;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.4);
    }
}
