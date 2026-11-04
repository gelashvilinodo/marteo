import { Icon } from "@iconify/react";

// ლიმიტის ხაზოვანი მრიცხველი („X / Y“). limit null — ულიმიტო, 0 — გეგმაში არ შედის.
export default function UsageMeter({ icon, label, used, limit, unit = "" }: { icon: string; label: string; used: number; limit: number | null; unit?: string }) {
    const share = limit ? Math.min(1, used / limit) : 0;
    return <div className="rounded-xl bg-background p-4">
        <p className="flex items-center gap-2 text-sm text-text-secondary"><Icon icon={icon} className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />{label}</p>
        <p className="mt-2 text-lg font-semibold text-text-primary">{limit === null ? `${used}${unit} · ულიმიტო` : `${used} / ${limit}${unit}`}</p>
        {limit !== null && limit > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/60" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
            <div className={`h-full rounded-full ${share >= 1 ? "bg-danger" : share >= 0.8 ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.round(share * 100)}%` }} />
        </div>}
        {limit !== null && limit > 0 && <p className="mt-2 text-xs text-text-secondary">დარჩა {Math.max(limit - used, 0)}</p>}
        {limit === 0 && <p className="mt-2 text-xs text-text-secondary">ამ გეგმაში არ შედის.</p>}
    </div>;
}
