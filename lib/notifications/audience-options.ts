import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";

// Client-safe: no database imports.
export const PLAN_AUDIENCES = [
    { value: "ALL", label: "ყველა პაკეტი" },
    { value: "PAID", label: "მხოლოდ გამომწერები" },
    { value: "FREE", label: "პაკეტის გარეშე (უფასო)" },
] as const;
export type PlanAudience = typeof PLAN_AUDIENCES[number]["value"];

export const PLAN_LABELS: Record<string, string> = { FREE: "უფასო", START: "Start", BUSINESS: "Business", PRO: "Pro" };

export type Audience = { modes: BusinessMode[]; plan: PlanAudience; registeredWithinDays: number | null };

export function describeAudience(audience: Audience) {
    const parts = [
        audience.modes.length ? audience.modes.map(m => BUSINESS_MODES.find(x => x.value === m)?.label ?? m).join(", ") : "ყველა ტიპი",
        PLAN_AUDIENCES.find(p => p.value === audience.plan)?.label ?? audience.plan,
    ];
    if (audience.registeredWithinDays) parts.push(`ბოლო ${audience.registeredWithinDays} დღეში დარეგისტრირებული`);
    return parts.join(" · ");
}
