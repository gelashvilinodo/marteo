"use client";

// სახიფათო ქმედების დადასტურება კოდის აპის კოდით (ან სარეზერვო კოდით).
export default function AdminCodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <label className="mt-3 block text-xs text-text-secondary">დასადასტურებლად კოდი აპიდან
        <input value={value} onChange={event => onChange(event.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" maxLength={11} placeholder="000000"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-center font-mono text-base tracking-[0.3em] text-text-primary outline-none transition focus:border-accent sm:text-sm" />
    </label>;
}
