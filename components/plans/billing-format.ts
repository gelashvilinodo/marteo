// თარიღები და სტატუსები გეგმის გვერდებისთვის. Intl-ს ყველა ბრაუზერში ქართული თვეები არ აქვს, ამიტომ ხელითაა.
import type { PlanState } from "@/lib/subscription/plan-state";
import { PLAN_LABELS } from "@/lib/subscription/plans";

const MONTHS = ["იან.", "თებ.", "მარ.", "აპრ.", "მაი.", "ივნ.", "ივლ.", "აგვ.", "სექ.", "ოქტ.", "ნოე.", "დეკ."];

export function formatDay(iso: string) {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date(iso)).split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function daysLeft(iso: string, now = Date.now()) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

export const LOCK_LABELS: Record<string, string> = {
    NO_PLAN: "გეგმა არ არის",
    TRIAL_ENDED: "საცდელი დასრულდა",
    PAYMENT_FAILED: "გადახდა ვერ შესრულდა",
    EXPIRED: "ვადა ამოიწურა",
    CANCELED: "გაუქმებულია",
};

export function planTitle(plan: PlanState) {
    if (plan.tier) return plan.tier === "TRIAL" ? "საცდელი პერიოდი" : `${PLAN_LABELS[plan.tier]} გეგმა`;
    return plan.lastPaidTier ? `${PLAN_LABELS[plan.lastPaidTier]} გეგმა` : "გეგმა არ არის არჩეული";
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    BANK_TRANSFER: "გადარიცხვა", CASH: "ნაღდი", CARD: "ბარათი", OTHER: "სხვა",
};
