// გეგმის შეცვლა პერიოდის შუაში. გადახდილი თანხა არ იკარგება: დაუხარჯავი დღეების ღირებულება
// (გადახდილი ÷ პერიოდის დღეები × დარჩენილი დღეები) ახალ გეგმაზე გადადის.
// აწევა: იხდის ახალი გეგმის ფასს გამოკლებული ნაშთი, ახალი თვე დღეიდან იწყება.
// დაწევა: არაფერს იხდის, ნაშთი ახალი გეგმის დღეებად იქცევა (თანხას არ ვაბრუნებთ).
// კლიენტზეც გამოიყენება (გადახდის გვერდი, დადასტურების ფანჯარა).
import { addBillingMonths } from "./period";
import { PLAN_PRICES, type PaidTier } from "./plans";

const DAY = 86_400_000;
const money = (value: number) => Math.round(value * 100) / 100;

export type PlanChangeQuote = {
    kind: "new" | "upgrade" | "downgrade";
    // დაუხარჯავი ნაშთი ლარში.
    credit: number;
    // დღეს გადასახდელი (დაწევისას 0).
    amountDue: number;
    // ახალი გეგმის ვადა.
    expiresAt: string;
    // დაწევისას: რამდენ დღეს ფარავს ნაშთი.
    days: number;
};

export type CurrentPeriod = {
    tier: PaidTier | "TRIAL" | null;
    // რეალურად გადახდილი თვიური ფასი (ფასდაკლების გათვალისწინებით).
    paid: number;
    periodStart: Date | null;
    expiresAt: Date | null;
};

export function quotePlanChange(current: CurrentPeriod, target: PaidTier, targetPrice: number, now = new Date()): PlanChangeQuote {
    const fresh = (): PlanChangeQuote => ({ kind: "new", credit: 0, amountDue: money(targetPrice), expiresAt: addBillingMonths(now, 1).toISOString(), days: 0 });
    // საცდელი, დაბლოკილი ან უვადო (ადმინის მიცემული) გეგმა ნაშთს არ იძლევა.
    if (!current.tier || current.tier === "TRIAL" || !current.periodStart || !current.expiresAt || current.expiresAt <= now) return fresh();
    const periodMs = current.expiresAt.getTime() - current.periodStart.getTime();
    if (periodMs <= 0) return fresh();
    const remainingMs = Math.min(periodMs, current.expiresAt.getTime() - now.getTime());
    const credit = money(current.paid * remainingMs / periodMs);
    if (PLAN_PRICES[target] > PLAN_PRICES[current.tier]) {
        return { kind: "upgrade", credit, amountDue: money(Math.max(0, targetPrice - credit)), expiresAt: addBillingMonths(now, 1).toISOString(), days: 0 };
    }
    // დაწევა: ნაშთი ახალი გეგმის დღიური ფასით (თვე = 30 დღე) დღეებად იქცევა.
    const days = Math.max(1, Math.floor(credit / (targetPrice / 30)));
    return { kind: "downgrade", credit, amountDue: 0, expiresAt: new Date(now.getTime() + days * DAY).toISOString(), days };
}
