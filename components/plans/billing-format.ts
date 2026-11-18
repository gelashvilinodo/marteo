// თარიღები და სტატუსები გეგმის გვერდებისთვის. Intl-ს ყველა ბრაუზერში ქართული თვეები არ აქვს, ამიტომ ხელითაა.
import type { PlanState } from "@/lib/subscription/plan-state";
import { PLAN_ADJECTIVES } from "@/lib/subscription/plans";

const MONTHS = ["იან.", "თებ.", "მარ.", "აპრ.", "მაი.", "ივნ.", "ივლ.", "აგვ.", "სექ.", "ოქტ.", "ნოე.", "დეკ."];

export function formatDay(iso: string) {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date(iso)).split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
}

const tbilisiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" });

// კალენდარული დღეები თბილისის დროით: ვადის დღეს 0, წინა დღეს 1. საათებით დამრგვალება
// ადმინის „დღის ბოლომდე“ ვადას ერთი დღით ზრდიდა (14-ის ნაცვლად 15).
export function daysLeft(iso: string, now = Date.now()) {
    const day = (time: number) => Date.parse(`${tbilisiDay.format(new Date(time))}T00:00:00Z`);
    return Math.max(0, Math.round((day(new Date(iso).getTime()) - day(now)) / 86_400_000));
}

export const LOCK_LABELS: Record<string, string> = {
    NO_PLAN: "გეგმა არ არის",
    TRIAL_ENDED: "საცდელი დასრულდა",
    PAYMENT_FAILED: "გადახდა ვერ შესრულდა",
    EXPIRED: "ვადა ამოიწურა",
    CANCELED: "გაუქმებულია",
};

export function planTitle(plan: PlanState) {
    if (plan.tier) return plan.tier === "TRIAL" ? "საცდელი პერიოდი" : `${PLAN_ADJECTIVES[plan.tier]} გეგმა${plan.interval === "YEARLY" ? " (წლიური)" : ""}`;
    return plan.lastPaidTier ? `${PLAN_ADJECTIVES[plan.lastPaidTier]} გეგმა` : "გეგმა არ არის არჩეული";
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    BANK_TRANSFER: "გადარიცხვა", CASH: "ნაღდი", CARD: "ბარათი", OTHER: "სხვა",
};
