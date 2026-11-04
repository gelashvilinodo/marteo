// Shared by the payment form (preview) and the server (the actual write), so both agree.
// Days are whole days in Tbilisi time; a period ends at 23:59:59 of its last day, like the plan editor.

export const PAID_PLANS = ["START", "BUSINESS", "PRO"] as const;
export type PaidPlan = typeof PAID_PLANS[number];

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    BANK_TRANSFER: "გადარიცხვა", CASH: "ნაღდი", CARD: "ბარათი", OTHER: "სხვა",
};

export const MONTH_OPTIONS = [1, 3, 6, 12] as const;
export const MAX_MONTHS = 24;

type Current = { plan: string | null; status: string | null; expiresAt: Date | null } | null;

const tbilisiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" });

export function toTbilisiDay(date: Date) {
    return tbilisiDay.format(date);
}

export function endOfTbilisiDay(day: string) {
    return new Date(`${day}T23:59:59+04:00`);
}

// 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
function addMonths(day: string, months: number) {
    const [year, month, date] = day.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1 + months, Math.min(date, lastDay))).toISOString().slice(0, 10);
}

/**
 * A running period continues from its end: a trial of any plan, or a paid plan renewed on the same plan.
 * A plan change starts today, so an upgrade takes effect at once.
 */
export function paymentPeriod(current: Current, plan: PaidPlan, months: number, now = new Date()) {
    const running = current?.expiresAt && current.expiresAt > now
        && (current.status === "TRIALING" || (current.status === "ACTIVE" && current.plan === plan));
    const start = running ? current!.expiresAt! : now;
    const end = endOfTbilisiDay(addMonths(toTbilisiDay(start), months));
    return { start, end, continues: Boolean(running) };
}
