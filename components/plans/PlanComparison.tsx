import { Icon } from "@iconify/react";
import { PLAN_CARDS, PLAN_COMPARISON, type ComparisonValue } from "@/lib/subscription/plan-catalog";

function Cell({ value }: { value: ComparisonValue }) {
    if (value === true) return <Icon icon="solar:check-circle-bold" className="mx-auto h-5 w-5 text-success" aria-label="შედის" />;
    if (value === false) return <Icon icon="solar:minus-circle-linear" className="mx-auto h-5 w-5 text-text-secondary/50" aria-label="არ შედის" />;
    return <span className="text-sm text-text-primary">{value}</span>;
}

// ტელეფონზე: მოკლე მნიშვნელობა, რომ სამი სვეტი ერთად დაეტიოს (200 / თვე → 200, ულიმიტო → ∞).
function ShortCell({ value }: { value: ComparisonValue }) {
    if (value === true) return <Icon icon="solar:check-circle-bold" className="mx-auto h-[18px] w-[18px] text-success" aria-label="შედის" />;
    if (value === false) return <Icon icon="solar:minus-circle-linear" className="mx-auto h-[18px] w-[18px] text-text-secondary/50" aria-label="არ შედის" />;
    return <span className="block text-xs leading-tight text-text-primary">{value.replace(" / თვე", "").replace("ულიმიტო", "∞")}</span>;
}

const SHORT_NAMES = { START: "სტარტი", BUSINESS: "ბიზნესი", PRO: "PRO" } as const;

// ტელეფონზე სამივე გეგმა ერთდროულად ჩანს: ვიწრო სვეტები და სქროლისას მიმაგრებული სათაური.
function MobileComparison() {
    const grid = "grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] items-center gap-x-1";
    return <div className="rounded-2xl border border-border bg-surface sm:hidden">
        <div className={`${grid} sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-10 rounded-t-2xl border-b border-border bg-surface px-3 py-3`}>
            <span className="text-[11px] text-text-secondary">თვიური ლიმიტები</span>
            {PLAN_CARDS.map(card => <span key={card.tier} className="text-center">
                <span className={`block text-xs font-semibold ${card.tier === "PRO" ? "text-accent" : "text-text-primary"}`}>{SHORT_NAMES[card.tier]}</span>
                <span className="block text-[11px] text-text-secondary">{card.price} ₾</span>
            </span>)}
        </div>
        {PLAN_COMPARISON.map(group => <section key={group.title} aria-label={group.title}>
            <h3 className="flex items-center gap-1.5 bg-background/60 px-3 py-2 text-xs font-semibold text-text-primary">
                <Icon icon={group.icon} className="h-4 w-4 text-accent" aria-hidden="true" />{group.title}
            </h3>
            {group.rows.map(row => <div key={row.label} className={`${grid} border-t border-border px-3 py-2.5`}>
                <span className="text-xs leading-snug text-text-secondary">{row.label}</span>
                {PLAN_CARDS.map(card => <span key={card.tier} className="text-center"><span className="sr-only">{SHORT_NAMES[card.tier]}: </span><ShortCell value={row.values[card.tier]} /></span>)}
            </div>)}
        </section>)}
    </div>;
}

// გეგმების სრული შედარება: ტელეფონზე ვიწრო სამსვეტიანი ვერსია, დიდ ეკრანზე ცხრილი.
export default function PlanComparison() {
    return <>
        <MobileComparison />
        <DesktopComparison />
    </>;
}

function DesktopComparison() {
    return <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface sm:block">
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
