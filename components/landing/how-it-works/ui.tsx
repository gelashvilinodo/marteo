import type { ReactNode } from "react";
import { Icon } from "@/components/shared/Icon";

// დეშბორდის პატარა ნაწილების ასლები. კლასები რეალური დეშბორდიდანაა, რომ დემო ზუსტად ისე გამოიყურებოდეს.

export function ProductThumb({ icon, tint, size = "h-12 w-12", iconSize = "h-8 w-8" }: { icon: string; tint: string; size?: string; iconSize?: string }) {
    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-gradient-to-br ${tint} ${size}`}>
            <Icon icon={icon} className={iconSize} />
        </span>
    );
}

export function PageTitle({ title, m }: { title: string; m: boolean }) {
    return (
        <h2 className={`flex items-center gap-3 font-bold text-text-primary ${m ? "text-[28px]" : "text-[32px]"}`}>
            {title}
            <Icon icon="solar:question-circle-linear" className="h-7 w-7 text-text-secondary" />
        </h2>
    );
}

export function PeriodSelect({ label, m, className = "" }: { label: string; m: boolean; className?: string }) {
    return (
        <span className={`flex h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-[17px] text-text-primary ${m ? "w-full" : "w-[300px]"} ${className}`}>
            <Icon icon="solar:calendar-linear" className="h-5 w-5 text-text-secondary" />
            {label}
            <Icon icon="solar:alt-arrow-down-linear" className="ml-auto h-5 w-5 text-text-secondary" />
        </span>
    );
}

export function GreenButton({ children, demo, pressed, className = "" }: { children: ReactNode; demo?: string; pressed?: boolean; className?: string }) {
    return (
        <span
            data-demo={demo}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-success font-semibold text-white shadow-lg shadow-success/20 transition-transform duration-150 ${pressed ? "scale-95 bg-success-hover" : ""} ${className}`}
        >
            {children}
        </span>
    );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <span className="block min-w-0">
            <span className="mb-1 block text-xs text-text-secondary">{label}</span>
            {children}
        </span>
    );
}

// შეყვანის ველის ვიზუალური ასლი: რეალური input არაა, რომ გვერდზე ფოკუსი არ წაიღოს.
export function FakeInput({
    value,
    placeholder,
    focused,
    glow = 0,
    demo,
    m,
    select,
    pressed,
}: {
    value: string;
    placeholder?: string;
    focused?: boolean;
    glow?: number;
    demo?: string;
    m: boolean;
    select?: boolean;
    pressed?: boolean;
}) {
    return (
        <span
            data-demo={demo}
            className={`relative flex w-full min-w-0 items-center rounded-xl border bg-background px-3 text-text-primary transition-[border-color,box-shadow,transform] duration-200 ${
                m ? "h-11 text-[16px]" : "h-10 text-sm"
            } ${focused ? "border-accent ring-4 ring-accent/15" : "border-border"} ${pressed ? "scale-[0.98]" : ""}`}
            style={glow > 0 ? { borderColor: `color-mix(in srgb, var(--marteo-success) ${Math.round(glow * 80)}%, var(--marteo-border))`, boxShadow: `0 0 0 ${4 * glow}px color-mix(in srgb, var(--marteo-success) 15%, transparent)` } : undefined}
        >
            <span className={`min-w-0 truncate whitespace-pre ${value ? "" : "text-text-secondary"}`}>{value || placeholder}</span>
            {focused && !select && <span className="demo-caret ml-px h-[1.15em] w-[1.5px] shrink-0 bg-accent" />}
            {select && <Icon icon="solar:alt-arrow-down-linear" className="ml-auto h-4 w-4 shrink-0 text-text-secondary" />}
        </span>
    );
}

export function Menu({ options, active, hover, demo }: { options: string[]; active: string; hover?: string; demo?: Record<string, string> }) {
    return (
        <span className="demo-pop absolute inset-x-0 top-full z-30 mt-1 block overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-[0_18px_40px_-12px_rgb(2_8_23/0.45)]">
            {options.map(option => (
                <span
                    key={option}
                    data-demo={demo?.[option]}
                    className={`flex h-10 items-center gap-2 px-3 text-sm transition-colors ${
                        hover === option ? "bg-accent text-white" : option === active ? "bg-accent/10 text-accent" : "text-text-primary"
                    }`}
                >
                    {option === active && <Icon icon="solar:check-read-linear" className="h-4 w-4" />}
                    {option}
                </span>
            ))}
        </span>
    );
}

export function Delta({ show, children, tone = "success" }: { show: boolean; children: ReactNode; tone?: "success" | "warning" | "danger" }) {
    const tones = { success: "bg-success/15 text-success", warning: "bg-warning/15 text-warning", danger: "bg-danger/15 text-danger" };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition-all duration-500 ${tones[tone]} ${
                show ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-75 opacity-0"
            }`}
        >
            {children}
        </span>
    );
}
