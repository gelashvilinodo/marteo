// ლენდინგის დემოების საერთო ნაწილი: დრო, კურსორის დაჭერები, კამერა, სქროლი და თავები.
// ყოველი დემო თავის სცენარს (Script) აწყობს, ხოლო ეკრანზე ყველაფერი t წამის სუფთა ფუნქციაა.

export type Mode = "desktop" | "mobile";

export const VIEWPORT = {
    desktop: { w: 1400, h: 860 },
    mobile: { w: 390, h: 720 },
} as const;

export type Click = { t: number; target: string; move: number };
export type CameraKey = { t: number; dur: number; target: string | null; scale: number; anchorY?: number };
export type ScrollKey = { t: number; dur: number; target: string | null; offset?: number };
export type Chapter = { id: string; label: string; caption: string; from: number };

export type BaseTimes = { end: number; duration: number };

export type Script<T extends BaseTimes = BaseTimes> = {
    mode: Mode;
    T: T;
    clicks: Click[];
    camera: CameraKey[];
    scroll: ScrollKey[];
    chapters: Chapter[];
    // დროის მონაკვეთები, როცა დესკტოპის კურსორი დამალულია (მაგ. ზუმის დროს არ ეფარებოდეს).
    hide?: [number, number][];
};

export type DemoDates = { period: string; today: string; last10: string[]; last7: string[] };

export function clamp(value: number, min = 0, max = 1) {
    return Math.min(Math.max(value, min), max);
}

export function easeInOut(x: number) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOut(x: number) {
    return 1 - Math.pow(1 - x, 3);
}

// ადამიანის ხელის მსგავსი მოძრაობა: სწრაფი აჩქარება, ნელი მიახლოება.
export function easeHand(x: number) {
    return 0.4 * easeInOut(x) + 0.6 * (1 - Math.pow(1 - x, 4));
}

// დროზე დამოკიდებული პატარა დამხმარეები, რომლითაც კადრი აიგება.
export function timeHelpers(t: number, clicks: Click[]) {
    const p = (from: number, to: number) => clamp((t - from) / (to - from));
    return {
        p,
        between: (from: number, to: number) => t >= from && t < to,
        type: (text: string, from: number, to: number) => {
            const chars = Array.from(text);
            return chars.slice(0, Math.floor(chars.length * p(from, to) + 1e-6)).join("");
        },
        pressed: (target: string) => clicks.some(click => click.target === target && t >= click.t - 0.05 && t < click.t + 0.16),
        near: (target: string) => clicks.some(click => click.target === target && t >= click.t - 0.4 && t < click.t + 0.16),
    };
}
