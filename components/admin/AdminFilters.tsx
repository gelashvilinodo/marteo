"use client";

import { Icon } from "@iconify/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type AdminFilterSelect = { name: string; label: string; options: { value: string; label: string }[] };

type AdminFiltersProps = {
    placeholder: string;
    values: Record<string, string>;
    selects: AdminFilterSelect[];
};

// Filters live in the URL, so a filtered list can be refreshed, shared or bookmarked.
export default function AdminFilters({ placeholder, values, selects }: AdminFiltersProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [pending, startTransition] = useTransition();
    const [query, setQuery] = useState(values.q ?? "");
    const latest = useRef(values);
    useEffect(() => { latest.current = values; }, [values]);

    const apply = (next: Record<string, string>) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...latest.current, ...next })) if (value) params.set(key, value);
        params.delete("page");
        const search = params.toString();
        startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
    };

    // Typing searches after a short pause instead of on every key.
    useEffect(() => {
        if (query.trim() === (latest.current.q ?? "")) return;
        const timer = setTimeout(() => apply({ q: query.trim() }), 350);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const active = selects.some(select => values[select.name]) || Boolean(values.q);

    return <div className="mt-5 flex flex-col gap-2 xl:flex-row xl:items-center">
        <label className="relative min-w-0 flex-1 xl:min-w-[260px]">
            <span className="sr-only">ძებნა</span>
            <Icon icon={pending ? "svg-spinners:180-ring" : "solar:magnifer-linear"} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} maxLength={100}
                className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-base text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent sm:text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {selects.map(select => <label key={select.name} className="min-w-0">
                <span className="sr-only">{select.label}</span>
                <select value={values[select.name] ?? ""} onChange={event => apply({ [select.name]: event.target.value })}
                    className={`h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none transition focus:border-accent sm:w-auto sm:text-sm ${values[select.name] ? "border-accent/50 text-accent" : "border-border text-text-primary"}`}>
                    <option value="">{select.label}</option>
                    {select.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </label>)}
            {active && <button type="button" onClick={() => { setQuery(""); apply(Object.fromEntries([["q", ""], ...selects.map(select => [select.name, ""])])); }}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm text-text-secondary transition hover:bg-surface hover:text-text-primary">
                <Icon icon="solar:close-circle-linear" className="h-4 w-4" aria-hidden="true" /> გასუფთავება
            </button>}
        </div>
    </div>;
}
