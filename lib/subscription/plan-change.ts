// გეგმის ან გადახდის პერიოდის შეცვლა პერიოდის შუაში. გადახდილი თანხა არ იკარგება: დაუხარჯავი დღეების ღირებულება
// (გადახდილი ÷ პერიოდის ხანგრძლივობა × დარჩენილი დრო) ახალ გეგმაზე გადადის.
// აწევა (ძვირი გეგმა, ან იგივე გეგმა თვიურიდან წლიურზე): იხდის ახალი პერიოდის სრულ ფასს, ნაშთი კი დღეებად ემატება.
// დაწევა (იაფი გეგმა, ან იგივე გეგმა წლიურიდან თვიურზე): არაფერს იხდის, ნაშთი ახალი გეგმის დღიური ფასით
// დღეებად იქცევა, ოღონდ ვადა არასდროს მცირდება (იგივე გეგმა თვიურზე უბრალოდ მიმდინარე ვადის ბოლოს გადადის).
// კლიენტზეც გამოიყენება (გადახდის გვერდი, დადასტურების ფანჯარა).
import { addBillingMonths } from "./period";
import { INTERVAL_DAYS, INTERVAL_MONTHS, PLAN_PRICES, type BillingInterval, type PaidTier } from "./plans";

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
    // რამდენ დღეს ფარავს ნაშთი (აწევისას ახალ პერიოდს ემატება).
    days: number;
};

export type CurrentPeriod = {
    tier: PaidTier | "TRIAL" | null;
    interval: BillingInterval;
    // რეალურად გადახდილი თანხა ამ პერიოდზე (ფასდაკლების გათვალისწინებით).
    paid: number;
    periodStart: Date | null;
    expiresAt: Date | null;
};

// აწევა თუ არა: ძვირი გეგმა, ან იგივე გეგმა უფრო გრძელი პერიოდით.
export function isUpgrade(from: PaidTier, fromInterval: BillingInterval, to: PaidTier, toInterval: BillingInterval) {
    if (PLAN_PRICES[to] !== PLAN_PRICES[from]) return PLAN_PRICES[to] > PLAN_PRICES[from];
    return INTERVAL_MONTHS[toInterval] > INTERVAL_MONTHS[fromInterval];
}

// targetPrice: ახალი პერიოდის ფასი (წლიურზე 10 თვისა).
export function quotePlanChange(current: CurrentPeriod, target: PaidTier, interval: BillingInterval, targetPrice: number, now = new Date()): PlanChangeQuote {
    const nextEnd = addBillingMonths(now, INTERVAL_MONTHS[interval]);
    const fresh = (): PlanChangeQuote => ({ kind: "new", credit: 0, amountDue: money(targetPrice), expiresAt: nextEnd.toISOString(), days: 0 });
    // საცდელი, დაბლოკილი ან უვადო (ადმინის მიცემული) გეგმა ნაშთს არ იძლევა.
    if (!current.tier || current.tier === "TRIAL" || !current.periodStart || !current.expiresAt || current.expiresAt <= now) return fresh();
    const periodMs = current.expiresAt.getTime() - current.periodStart.getTime();
    if (periodMs <= 0) return fresh();
    const remainingMs = Math.min(periodMs, current.expiresAt.getTime() - now.getTime());
    const credit = money(current.paid * remainingMs / periodMs);
    // ნაშთი ახალი გეგმის დღიური ფასით დღეებად იქცევა.
    const days = Math.floor(credit / (targetPrice / INTERVAL_DAYS[interval]));
    // აწევა: სრული ფასი (ბანკის ავტოგანახლება ყოველ პერიოდზე პირველი გადახდის თანხას ჩამოჭრის), ნაშთი კი ახალ პერიოდს ემატება.
    if (isUpgrade(current.tier, current.interval, target, interval)) {
        return { kind: "upgrade", credit, amountDue: money(targetPrice), expiresAt: new Date(nextEnd.getTime() + days * DAY).toISOString(), days };
    }
    // დაწევა: გადახდა არ არის. ვადა არასდროს მოკლდება: მინიმუმ დარჩენილი დღეები რჩება.
    const remainingDays = Math.ceil(remainingMs / DAY);
    const kept = Math.max(1, days, remainingDays);
    const expiresAt = days > remainingDays ? new Date(now.getTime() + kept * DAY) : current.expiresAt;
    return { kind: "downgrade", credit, amountDue: 0, expiresAt: expiresAt.toISOString(), days: kept };
}
