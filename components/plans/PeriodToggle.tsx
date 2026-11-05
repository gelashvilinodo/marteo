import Link from "next/link";
import { Icon } from "@iconify/react";
import { INTERVAL_LABELS, YEARLY_PAID_MONTHS, type BillingInterval } from "@/lib/subscription/plans";

// თვიური/წლიური გადამრთველი. ფასების გვერდზე ღილაკებია (onSelect), დაშბორდში ბმულები (href), რომ გვერდმა ფასები თავიდან დაითვალოს.
export default function PeriodToggle({ value, onSelect, href }: {
    value: BillingInterval;
    onSelect?: (value: BillingInterval) => void;
    href?: (value: BillingInterval) => string;
}) {
    const yearly = value === "YEARLY";
    const option = (interval: BillingInterval) => {
        const active = interval === value;
        const className = `relative inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${active ? "bg-accent text-white shadow-md shadow-accent/25" : "text-text-secondary hover:text-text-primary"}`;
        const content = <>
            {INTERVAL_LABELS[interval]}
            {interval === "YEARLY" && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-white/20 text-white" : "bg-success/15 text-success"}`}>−{Math.round((12 - YEARLY_PAID_MONTHS) / 12 * 100)}%</span>}
        </>;
        return href
            ? <Link key={interval} href={href(interval)} scroll={false} role="radio" aria-checked={active} className={className}>{content}</Link>
            : <button key={interval} type="button" role="radio" aria-checked={active} onClick={() => onSelect?.(interval)} className={className}>{content}</button>;
    };
    return <div className="flex flex-col items-center gap-3">
        <div role="radiogroup" aria-label="გადახდის პერიოდი" className="inline-flex rounded-2xl border border-border bg-surface p-1">
            {option("MONTHLY")}{option("YEARLY")}
        </div>
        <p className={`inline-flex items-center gap-1.5 text-center text-sm transition-colors ${yearly ? "font-semibold text-success" : "text-text-secondary"}`}>
            <Icon icon="solar:gift-bold-duotone" className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            {yearly ? `12 თვე ${YEARLY_PAID_MONTHS} თვის ფასად` : `წლიურ გადახდაზე ${12 - YEARLY_PAID_MONTHS} თვე საჩუქრად`}
        </p>
    </div>;
}
