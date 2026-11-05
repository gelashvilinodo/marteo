// ბიზნესის გეგმის მიმდინარე მდგომარეობა: რომელი გეგმა მოქმედებს, ან რატომ არის ბიზნესი მხოლოდ ნახვის რეჟიმში.
// კლიენტზეც გამოიყენება, ამიტომ აქ სერვერის კოდი არ უნდა იყოს.
import { isPaidTier, tierHasFeature, type PaidTier, type PlanFeature, type PlanTier } from "./plans";

export type SubscriptionRow = {
    plan: string;
    status: string;
    expiresAt: Date | string | null;
    currentPeriodStart?: Date | string | null;
    cancelAtPeriodEnd?: boolean | null;
};

// NO_PLAN: გეგმა არასდროს ყოფილა (მაგ. ახალი დამატებითი ბიზნესი გადახდამდე).
export type LockReason = "NO_PLAN" | "TRIAL_ENDED" | "PAYMENT_FAILED" | "EXPIRED" | "CANCELED";

export type PlanState = {
    tier: PlanTier | null;
    locked: boolean;
    lockReason: LockReason | null;
    // ბოლოს ნაყიდი გეგმა: დაბლოკვისას გუნდი მისი ლიმიტით რჩება, რომ წევრები არ გაიყინოს.
    lastPaidTier: PaidTier | null;
    status: string;
    expiresAt: string | null;
    periodStart: string | null;
    cancelAtPeriodEnd: boolean;
};

const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;

export function planStateFrom(row: SubscriptionRow | null, now = new Date()): PlanState {
    const lastPaidTier = row && isPaidTier(row.plan) ? row.plan : null;
    const base = {
        lastPaidTier,
        status: row?.status ?? "ACTIVE",
        expiresAt: iso(row?.expiresAt),
        periodStart: iso(row?.currentPeriodStart),
        cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    };
    const locked = (lockReason: LockReason): PlanState => ({ ...base, tier: null, locked: true, lockReason });
    const active = (tier: PlanTier): PlanState => ({ ...base, tier, locked: false, lockReason: null });
    if (!row) return locked("NO_PLAN");
    const ended = row.expiresAt != null && new Date(row.expiresAt) <= now;
    switch (row.status) {
        case "TRIALING": return ended ? locked("TRIAL_ENDED") : active("TRIAL");
        case "PAST_DUE": return locked("PAYMENT_FAILED");
        // საცდელი FREE გეგმით ინახება, ამიტომ ვადაგასული FREE საცდელის დასრულებაა.
        case "EXPIRED": return locked(lastPaidTier ? "EXPIRED" : "TRIAL_ENDED");
        case "CANCELED": return locked("CANCELED");
        default:
            if (!lastPaidTier) return locked("NO_PLAN");
            return ended ? locked("EXPIRED") : active(lastPaidTier);
    }
}

export function planAllows(state: PlanState | null | undefined, feature: PlanFeature) {
    return Boolean(state && !state.locked && state.tier && tierHasFeature(state.tier, feature));
}

// გუნდის ლიმიტისთვის: დაბლოკილ ბიზნესში წევრები რჩებიან (ისინიც მხოლოდ ნახვის რეჟიმში არიან).
export function teamTier(state: PlanState): PlanTier | null {
    return state.tier ?? state.lastPaidTier;
}

// მხოლოდ ნახვის რეჟიმში ღია განყოფილებები. დანარჩენი საიდბარზე დაბლოკილია.
export const LOCKED_OPEN_SECTIONS: readonly string[] = [
    "/dashboard", "/dashboard/orders", "/dashboard/customers", "/dashboard/analytics",
    "/dashboard/business-settings", "/dashboard/profile", "/dashboard/help", "/dashboard/notifications",
    "/dashboard/plans", "/dashboard/billing",
];

export const LOCK_MESSAGES: Record<LockReason, string> = {
    NO_PLAN: "ამ ბიზნესს გეგმა ჯერ არ აქვს. აირჩიეთ გეგმა, რომ მონაცემები დაამატოთ და შეცვალოთ.",
    TRIAL_ENDED: "საცდელი პერიოდი დასრულდა. აირჩიეთ გეგმა, რომ მონაცემები დაამატოთ და შეცვალოთ.",
    PAYMENT_FAILED: "გადახდა ვერ შესრულდა. გადაიხადეთ, რომ მონაცემები დაამატოთ და შეცვალოთ.",
    EXPIRED: "გეგმის ვადა ამოიწურა. განაახლეთ გეგმა, რომ მონაცემები დაამატოთ და შეცვალოთ.",
    CANCELED: "გეგმა გაუქმებულია. აირჩიეთ გეგმა, რომ მონაცემები დაამატოთ და შეცვალოთ.",
};
