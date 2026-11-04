// Shared by the server (limit checks) and the AI panel (the remaining-uses ring).
import { PLAN_LIMITS } from "@/lib/subscription/plans";

// Questions per payment period (the trial counts as one period); the plan's own numbers live in lib/subscription/plans.ts.
// Chat titles do not count. FREE means no plan at all.
export const AI_MONTHLY_LIMITS = {
    FREE: 0,
    TRIAL: PLAN_LIMITS.TRIAL.aiQuestions,
    START: PLAN_LIMITS.START.aiQuestions,
    BUSINESS: PLAN_LIMITS.BUSINESS.aiQuestions,
    PRO: PLAN_LIMITS.PRO.aiQuestions,
} as const;

// The ring turns to the upgrade offer once this share of the limit is used.
export const AI_QUOTA_WARN_SHARE = 0.8;

// used/limit — კითხვები. files — შესყიდვა ფაილიდან, ცალკე მრიცხველით (limit null = ულიმიტო);
// საცდელში ფაილი კითხვებში ითვლება და files.shared = true. resetsAt — გადახდის პერიოდის ბოლო
// (ლიმიტი ახალ პერიოდში ნულდება); საცდელში ის საცდელის დასასრულია და აღარ ნულდება.
export type AiQuota = {
    plan: string; used: number; limit: number; disabled: boolean; custom: boolean; resetsAt: string | null; trial: boolean;
    files: { used: number; limit: number | null; shared: boolean };
};

const tbilisiMonth = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit" }).format(date);

export function tbilisiMonthStart(now = new Date()) {
    return new Date(`${tbilisiMonth(now)}-01T00:00:00+04:00`);
}

// Intl has no Georgian month names in every browser, so the dative ("1 დეკემბერს") is written out.
const MONTHS_DATIVE = ["იანვარს", "თებერვალს", "მარტს", "აპრილს", "მაისს", "ივნისს", "ივლისს", "აგვისტოს", "სექტემბერს", "ოქტომბერს", "ნოემბერს", "დეკემბერს"];

export function formatResetDay(iso: string) {
    const [, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date(iso)).split("-").map(Number);
    return `${day} ${MONTHS_DATIVE[month - 1]}`;
}

export function nextTbilisiMonthStart(now = new Date()) {
    const [year, month] = tbilisiMonth(now).split("-").map(Number);
    return new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7)}-01T00:00:00+04:00`);
}
