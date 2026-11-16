import Link from "next/link";
import { Icon } from "@/components/shared/Icon";
import Swap from "./Swap";
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
        const className = `relative z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-300 motion-reduce:transition-none ${active ? "text-white" : "text-text-secondary hover:text-text-primary"}`;
        const content = <>
            {INTERVAL_LABELS[interval]}
            {interval === "YEARLY" && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-colors duration-300 motion-reduce:transition-none ${active ? "bg-white/20 text-white" : "bg-success/15 text-[#0d7a3b] dark:text-success"}`}>−{Math.round((12 - YEARLY_PAID_MONTHS) / 12 * 100)}%</span>}
        </>;
        return href
            ? <Link key={interval} href={href(interval)} scroll={false} role="radio" aria-checked={active} className={className}>{content}</Link>
            : <button key={interval} type="button" role="radio" aria-checked={active} onClick={() => onSelect?.(interval)} className={className}>{content}</button>;
    };
    const gift = <Icon icon="solar:gift-bold-duotone" className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />;
    return <div className="flex flex-col items-center gap-3">
        {/* ორი თანაბარი სვეტი: ლურჯი ფონი ერთი ბლოკია და აქტიურ ღილაკზე გადასრიალდება. */}
        <div role="radiogroup" aria-label="გადახდის პერიოდი" className="relative grid grid-cols-2 rounded-2xl border border-border bg-surface p-1">
            <span aria-hidden="true" className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-accent shadow-md shadow-accent/25 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${yearly ? "translate-x-full" : "translate-x-0"}`} />
            {option("MONTHLY")}{option("YEARLY")}
        </div>
        {/* საჩუქარი იქონთან ერთად იცვლება, რომ მოკლე ტექსტი იქონს არ დაშორდეს. */}
        <Swap on={yearly} className="justify-items-center text-center text-sm"
            yes={<span className="inline-flex items-center gap-1.5 font-semibold text-[#0d7a3b] dark:text-success">{gift}12 თვე {YEARLY_PAID_MONTHS} თვის ფასად</span>}
            no={<span className="inline-flex items-center gap-1.5 text-text-secondary">{gift}წლიურ გადახდაზე {12 - YEARLY_PAID_MONTHS} თვე საჩუქრად</span>} />
    </div>;
}
