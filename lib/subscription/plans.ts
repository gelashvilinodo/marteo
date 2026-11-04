// გეგმების ერთადერთი წყარო: ფასები, ლიმიტები და რომელი ფუნქცია რომელ გეგმაშია.
// კლიენტზეც გამოიყენება (გვირგვინები, გეგმების გვერდი), ამიტომ აქ სერვერის კოდი არ უნდა იყოს.
import type { BusinessMode } from "@/lib/business/business-mode";

export const PAID_TIERS = ["START", "BUSINESS", "PRO"] as const;
export type PaidTier = typeof PAID_TIERS[number];
// TRIAL არის 14-დღიანი საცდელი, არა შესაძენი გეგმა.
export type PlanTier = "TRIAL" | PaidTier;

export const TRIAL_DAYS = 14;
// საცდელის დასრულებამდე ამდენი დღით ადრე ეგზავნება შეხსენება.
export const TRIAL_REMINDER_DAYS = 2;
// დამატებითი ბიზნესის ფასდაკლება.
export const EXTRA_BUSINESS_DISCOUNT = 0.25;
// ყიდვიდან ამდენ დღეში შეიძლება თანხის დაბრუნების მოთხოვნა.
export const REFUND_WINDOW_DAYS = 3;

export const PLAN_LABELS: Record<PlanTier, string> = {
    TRIAL: "საცდელი", START: "სტარტი", BUSINESS: "ბიზნესი", PRO: "PRO",
};
// სიტყვა „გეგმის“ წინ (ბიზნეს გეგმა, სტარტ გეგმიდან) და „-ზე“ ფორმა (გადასვლა ბიზნესზე).
export const PLAN_ADJECTIVES: Record<PlanTier, string> = {
    TRIAL: "საცდელ", START: "სტარტ", BUSINESS: "ბიზნეს", PRO: "PRO",
};
export const PLAN_ONTO: Record<PlanTier, string> = {
    TRIAL: "საცდელზე", START: "სტარტზე", BUSINESS: "ბიზნესზე", PRO: "PRO-ზე",
};

// ლარი, თვეში. ფასში შედის ბანკის საკომისიო.
export const PLAN_PRICES: Record<PaidTier, number> = { START: 19, BUSINESS: 39, PRO: 79 };

// null ნიშნავს ულიმიტოს. AI და შეკვეთები ითვლება გადახდის პერიოდში, საცდელში კი მთელ საცდელზე.
export type PlanLimits = {
    ordersPerPeriod: number | null;
    aiQuestions: number;
    aiFiles: number | null;
    // საცდელში ფაილი ცალკე მრიცხველს არ იყენებს და კითხვებში ითვლება.
    aiFilesAreQuestions: boolean;
    smsIncluded: number;
    coOwners: number;
    staff: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    TRIAL: { ordersPerPeriod: null, aiQuestions: 20, aiFiles: null, aiFilesAreQuestions: true, smsIncluded: 0, coOwners: 0, staff: 0 },
    START: { ordersPerPeriod: 200, aiQuestions: 0, aiFiles: 0, aiFilesAreQuestions: false, smsIncluded: 0, coOwners: 0, staff: 0 },
    BUSINESS: { ordersPerPeriod: 500, aiQuestions: 100, aiFiles: 5, aiFilesAreQuestions: false, smsIncluded: 0, coOwners: 1, staff: 5 },
    PRO: { ordersPerPeriod: null, aiQuestions: 500, aiFiles: null, aiFilesAreQuestions: false, smsIncluded: 500, coOwners: 5, staff: 15 },
};

// ფუნქციები, რომლებიც ყველა გეგმაში არ არის. შეკვეთები, კლიენტები, ანალიტიკა,
// სტატისტიკა, კალენდარი, ინვოისები და დახმარება ყველგანაა და აქ არ ჩანს.
export const PLAN_FEATURES = [
    "stock",        // შესყიდვები, მარაგი, მასალები, წარმოება, შესაძენი სია, მარაგი შეკვეთაში
    "orderPhotos",  // ფოტო შეკვეთაში
    "reports",      // ბიზნესის ანგარიში და მარაგის უწყისი
    "fileImport",   // ფაილიდან იმპორტი
    "ai",           // მართეო AI ჩატი
    "aiFiles",      // შესყიდვა ფაილიდან AI-ით
    "sms",          // SMS მომხმარებელთან
    "team",         // თანამფლობელი და თანამშრომელი
    "extraBusiness",// მეორე და შემდეგი ბიზნესი
    "hybridMode",   // იმპორტი და წარმოება ერთად
] as const;
export type PlanFeature = typeof PLAN_FEATURES[number];

// ყველაზე იაფი გეგმა, სადაც ფუნქცია ჩნდება. ის განსაზღვრავს გვირგვინის ფერს:
// PRO ოქროსფერია, BUSINESS ლურჯი (დღე) / თეთრი (ღამე).
export const FEATURE_MIN_TIER: Record<PlanFeature, PaidTier> = {
    stock: "BUSINESS", orderPhotos: "BUSINESS", reports: "BUSINESS", fileImport: "BUSINESS",
    ai: "BUSINESS", aiFiles: "BUSINESS", sms: "BUSINESS", team: "BUSINESS",
    extraBusiness: "BUSINESS", hybridMode: "PRO",
};

// საცდელში ყველაფერი ღიაა გარდა ამათისა.
const TRIAL_BLOCKED: readonly PlanFeature[] = ["sms", "team", "extraBusiness"];

const TIER_RANK: Record<PaidTier, number> = { START: 1, BUSINESS: 2, PRO: 3 };

export function tierHasFeature(tier: PlanTier, feature: PlanFeature) {
    if (tier === "TRIAL") return !TRIAL_BLOCKED.includes(feature);
    return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

export function allowedModes(tier: PlanTier): readonly BusinessMode[] {
    if (tier === "START") return ["IMPORT"];
    if (tier === "BUSINESS") return ["IMPORT", "MANUFACTURING"];
    return ["IMPORT", "MANUFACTURING", "HYBRID"];
}

// გეგმაზე გადასვლისას დაუშვებელი მიმართულება იმპორტზე გადადის (მონაცემები არ იშლება).
export function clampMode(tier: PlanTier, mode: BusinessMode): BusinessMode {
    return allowedModes(tier).includes(mode) ? mode : "IMPORT";
}

export function isPaidTier(value: unknown): value is PaidTier {
    return PAID_TIERS.includes(value as PaidTier);
}

export function discountedPrice(tier: PaidTier) {
    return Math.round(PLAN_PRICES[tier] * (1 - EXTRA_BUSINESS_DISCOUNT) * 100) / 100;
}
