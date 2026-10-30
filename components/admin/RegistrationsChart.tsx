"use client";

import { useState } from "react";

type Day = { day: string; users: number; businesses: number };

const MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

function label(day: string) {
    const [, month, date] = day.split("-").map(Number);
    return `${date} ${MONTHS[month - 1]}`;
}

// One series (new users), so the title names it and no legend is drawn.
// Businesses created that day appear in the tooltip only.
export default function RegistrationsChart({ days }: { days: Day[] }) {
    const [active, setActive] = useState<number | null>(null);
    const max = Math.max(1, ...days.map(day => day.users));
    const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, value) => value) : [0, Math.round(max / 2), max];
    const total = days.reduce((sum, day) => sum + day.users, 0);
    const focus = active === null ? null : days[active];

    return <figure className="m-0">
        <figcaption className="text-sm text-text-secondary">სულ <b className="font-semibold text-text-primary">{total}</b> ახალი მომხმარებელი</figcaption>

        <div className="relative mt-4 h-44" onMouseLeave={() => setActive(null)}>
            {ticks.map(tick => <div key={tick} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(tick / max) * 100}%` }}>
                <span className="w-5 shrink-0 translate-y-1/2 text-right text-[10px] text-text-secondary">{tick}</span>
                <span className={`h-px flex-1 ${tick === 0 ? "bg-border" : "bg-border/50"}`} />
            </div>)}
            <div className="absolute inset-y-0 left-7 right-0 flex items-end gap-[2px]" aria-hidden="true">
                {days.map((day, index) => <button key={day.day} type="button" tabIndex={-1}
                    onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}
                    className="group flex h-full min-w-0 flex-1 items-end">
                    <span className={`block w-full rounded-t-[4px] transition-colors ${day.users ? "bg-accent" : "bg-transparent"} ${active === index ? "opacity-100" : active === null ? "opacity-90" : "opacity-50"}`}
                        style={{ height: day.users ? `max(${(day.users / max) * 100}%, 3px)` : 0 }} />
                </button>)}
            </div>
            {focus && <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                style={{ left: `calc(1.75rem + (100% - 1.75rem) * ${(active! + 0.5) / days.length})` }}>
                <p className="font-semibold text-text-primary">{label(focus.day)}</p>
                <p className="mt-0.5 whitespace-nowrap text-text-secondary">მომხმარებელი: <b className="text-text-primary">{focus.users}</b></p>
                <p className="whitespace-nowrap text-text-secondary">ბიზნესი: <b className="text-text-primary">{focus.businesses}</b></p>
            </div>}
        </div>
        <div className="ml-7 mt-1.5 flex justify-between text-[10px] text-text-secondary" aria-hidden="true">
            {[0, 7, 14, 21, days.length - 1].map(index => <span key={index}>{label(days[index].day)}</span>)}
        </div>

        <table className="sr-only">
            <caption>ახალი მომხმარებლები და ბიზნესები დღეების მიხედვით</caption>
            <thead><tr><th scope="col">დღე</th><th scope="col">მომხმარებელი</th><th scope="col">ბიზნესი</th></tr></thead>
            <tbody>{days.map(day => <tr key={day.day}><td>{label(day.day)}</td><td>{day.users}</td><td>{day.businesses}</td></tr>)}</tbody>
        </table>
    </figure>;
}
