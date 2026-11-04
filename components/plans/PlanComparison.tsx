import { Icon } from "@iconify/react";
import { PLAN_CARDS, PLAN_COMPARISON, type ComparisonValue } from "@/lib/subscription/plan-catalog";

function Cell({ value }: { value: ComparisonValue }) {
    if (value === true) return <Icon icon="solar:check-circle-bold" className="mx-auto h-5 w-5 text-success" aria-label="შედის" />;
    if (value === false) return <Icon icon="solar:minus-circle-linear" className="mx-auto h-5 w-5 text-text-secondary/50" aria-label="არ შედის" />;
    return <span className="text-sm text-text-primary">{value}</span>;
}

// გეგმების სრული შედარება. ვიწრო ეკრანზე ცხრილი თავის ჩარჩოში სქროლავს, გვერდი კი არა.
export default function PlanComparison() {
    return <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">გეგმების სრული შედარება</caption>
            <thead>
                <tr className="border-b border-border">
                    <th scope="col" className="w-[40%] p-4 text-sm font-medium text-text-secondary">ფუნქცია</th>
                    {PLAN_CARDS.map(card => <th key={card.tier} scope="col" className="p-4 text-center">
                        <span className="block text-base font-semibold text-text-primary">{card.name}</span>
                        <span className="text-sm text-text-secondary">{card.price} ₾ / თვე</span>
                    </th>)}
                </tr>
            </thead>
            {PLAN_COMPARISON.map(group => <tbody key={group.title}>
                <tr className="bg-background/60">
                    <th scope="colgroup" colSpan={4} className="px-4 py-3 text-sm font-semibold text-text-primary">
                        <span className="flex items-center gap-2"><Icon icon={group.icon} className="h-5 w-5 text-accent" aria-hidden="true" />{group.title}</span>
                    </th>
                </tr>
                {group.rows.map(row => <tr key={row.label} className="border-t border-border">
                    <th scope="row" className="p-4 text-sm font-normal text-text-secondary">{row.label}</th>
                    {PLAN_CARDS.map(card => <td key={card.tier} className="p-4 text-center"><Cell value={row.values[card.tier]} /></td>)}
                </tr>)}
            </tbody>)}
        </table>
    </div>;
}
