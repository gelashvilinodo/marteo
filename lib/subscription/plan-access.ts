// გეგმის შემოწმება API-სთვის და გვერდებისთვის. lib/business/access.ts იძახებს,
// ამიტომ ცალკე როუტებს ეს ფაილი პირდაპირ არ სჭირდებათ. კლიენტზეც გამოიყენება.
import type { AccessLevel, BusinessPermission, SectionNeed } from "@/lib/business/permissions";
import { LOCK_MESSAGES, planAllows, type PlanState } from "./plan-state";
import { FEATURE_MIN_TIER, PLAN_ADJECTIVES, type PaidTier, type PlanFeature } from "./plans";

export type PlanCheck = {
    // ფუნქცია, რომელიც როუტს სჭირდება (უფლების გარდა).
    feature?: PlanFeature;
    // ცვლილება, რომელიც მხოლოდ ნახვის რეჟიმშიც დაშვებულია (მაგ. დახმარება, ბიზნესის წაშლა).
    allowLocked?: boolean;
};

// 402 პასუხის ფორმა: კლიენტი ამით ხსნის გეგმის ფანჯარას.
export type PlanDenial = {
    code: "PLAN_LOCKED" | "PLAN_FEATURE";
    feature: PlanFeature | null;
    requiredTier: PaidTier | null;
    message: string;
};

// მარაგთან დაკავშირებული უფლებები ავტომატურად მოითხოვს "stock" ფუნქციას.
const STOCK_AREAS: readonly BusinessPermission[] = ["PURCHASES", "INVENTORY", "PRODUCTION"];
// მხოლოდ ნახვის რეჟიმში ეს განყოფილებები სანახავადაც დაკეტილია.
const LOCKED_HIDDEN_AREAS: readonly BusinessPermission[] = [...STOCK_AREAS, "CONTENT"];

const needAreas = (need: SectionNeed): readonly BusinessPermission[] =>
    need === "OWNER" || need === "MEMBER" ? [] : typeof need === "string" ? [need] : need;

export function featureMessage(feature: PlanFeature) {
    const tier = FEATURE_MIN_TIER[feature];
    return tier === "PRO"
        ? "ეს ფუნქცია მხოლოდ PRO გეგმაშია."
        : `ეს ფუნქცია ხელმისაწვდომია ${PLAN_ADJECTIVES[tier]} გეგმიდან.`;
}

export function planDenial(plan: PlanState | null | undefined, need: SectionNeed, level: AccessLevel, check: PlanCheck = {}): PlanDenial | null {
    if (!plan) return null;
    const areas = needAreas(need);
    const features = [check.feature, areas.some(area => STOCK_AREAS.includes(area)) ? "stock" as const : undefined]
        .filter((feature): feature is PlanFeature => Boolean(feature));
    if (plan.locked) {
        const blocked = (level === "edit" && !check.allowLocked)
            || areas.some(area => LOCKED_HIDDEN_AREAS.includes(area))
            || features.length > 0;
        if (!blocked) return null;
        return { code: "PLAN_LOCKED", feature: null, requiredTier: null, message: LOCK_MESSAGES[plan.lockReason ?? "NO_PLAN"] };
    }
    const missing = features.find(feature => !planAllows(plan, feature));
    if (!missing) return null;
    return { code: "PLAN_FEATURE", feature: missing, requiredTier: FEATURE_MIN_TIER[missing], message: featureMessage(missing) };
}
