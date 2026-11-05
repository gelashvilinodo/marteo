// გეგმების ქარდების ტექსტი: საჯარო ფასების გვერდი, გეგმის ფანჯარა და გეგმების გვერდი ერთსა და იმავეს აჩვენებს.
// ციფრები plans.ts-დან მოდის, რომ ქარდი და რეალური ლიმიტი არასდროს გაიყაროს.
import { PLAN_LIMITS, PLAN_PRICES, TRIAL_DAYS, type PaidTier } from "./plans";

// ქარდზე მხოლოდ ის ჩანს, რაც გეგმაში შედის; რა აკლია, შედარების ცხრილი აჩვენებს.
export type PlanRow = {
    label: string;
    value?: string;
};

export type PlanCard = {
    tier: PaidTier;
    name: string;
    icon: string;
    tagline: string;
    audience: string;
    price: number;
    perDay: string;
    // ბეჯი მხოლოდ გამოკვეთილ ქარდზე ჩანს.
    badge?: string;
    // „სტარტი, პლუს:“ — წინა გეგმის ყველაფერი შედის.
    includesPrevious?: string;
    rows: PlanRow[];
};

const n = (value: number | null) => value === null ? "ულიმიტო" : `${value} / თვე`;
const perDay = (price: number) => `დღეში ${(price / 30).toFixed(1)} ₾`;
const team = (tier: PaidTier) => `${PLAN_LIMITS[tier].coOwners} + ${PLAN_LIMITS[tier].staff}`;

export const PLAN_CARDS: readonly PlanCard[] = [
    {
        tier: "START",
        name: "სტარტი",
        icon: "solar:leaf-bold-duotone",
        tagline: "პირველი ნაბიჯი, წესრიგით",
        audience: "ვინც ახლა იწყებს ონლაინ გაყიდვებს და შეკვეთების წესრიგი სჭირდება.",
        price: PLAN_PRICES.START,
        perDay: perDay(PLAN_PRICES.START),
        rows: [
            { label: "შეკვეთები", value: n(PLAN_LIMITS.START.ordersPerPeriod) },
            { label: "ინვოისი და შეკვეთის ბმული" },
            { label: "დაბრუნება და გაცვლა" },
            { label: "მომხმარებლების ბაზა" },
            { label: "ანალიტიკა და სტატისტიკა" },
            { label: "კონტენტ-კალენდარი" },
            { label: "თანამშრომელი უფლებებით", value: String(PLAN_LIMITS.START.staff) },
        ],
    },
    {
        tier: "BUSINESS",
        name: "ბიზნესი",
        icon: "solar:shop-2-bold-duotone",
        tagline: "მთელი ბიზნესი ერთ სივრცეში",
        audience: "მზარდი მაღაზიისთვის, რომელსაც მარაგი, შესყიდვები და გუნდი ერთად უნდა.",
        price: PLAN_PRICES.BUSINESS,
        perDay: perDay(PLAN_PRICES.BUSINESS),
        badge: "პოპულარული",
        includesPrevious: "სტარტი, პლუს:",
        rows: [
            { label: "შეკვეთები", value: n(PLAN_LIMITS.BUSINESS.ordersPerPeriod) },
            { label: "შესყიდვები და მარაგი, ფოტოებით" },
            { label: "იმპორტი ან წარმოება" },
            { label: "ბიზნესის ანგარიში, მარაგის უწყისი" },
            { label: "ფაილიდან იმპორტი" },
            { label: "მართეო AI", value: n(PLAN_LIMITS.BUSINESS.aiQuestions) },
            { label: "შესყიდვა ფაილიდან", value: n(PLAN_LIMITS.BUSINESS.aiFiles) },
            { label: "გუნდი", value: team("BUSINESS") },
            { label: "SMS მომხმარებელთან", value: "პაკეტით" },
            { label: "ახალი ბიზნესი", value: "−25%" },
        ],
    },
    {
        tier: "PRO",
        name: "PRO",
        icon: "solar:crown-bold",
        tagline: "ზრდა, საზღვრების გარეშე",
        audience: "დიდი გუნდისთვის და ბიზნესისთვის, რომელიც აწარმოებს და აიმპორტებს ერთდროულად.",
        price: PLAN_PRICES.PRO,
        perDay: perDay(PLAN_PRICES.PRO),
        badge: "რეკომენდებული",
        includesPrevious: "ბიზნესი, პლუს:",
        rows: [
            { label: "შეკვეთები", value: "ულიმიტო" },
            { label: "მართეო AI", value: n(PLAN_LIMITS.PRO.aiQuestions) },
            { label: "შესყიდვა ფაილიდან", value: "ულიმიტო" },
            { label: "SMS მომხმარებელთან", value: n(PLAN_LIMITS.PRO.smsIncluded) },
            { label: "იმპორტი და წარმოება ერთად" },
            { label: "გუნდი", value: team("PRO") },
            { label: "ყოველი ახალი ბიზნესი", value: "−25%" },
        ],
    },
];

export const TRIAL_PITCH = `${TRIAL_DAYS} დღე უფასოდ · ყველა ფუნქცია · ${PLAN_LIMITS.TRIAL.aiQuestions} AI კითხვა`;
export const PLAN_FINE_PRINT = "ყოველთვიური გადახდა · გააუქმეთ ნებისმიერ დროს";

export function planCard(tier: PaidTier) {
    return PLAN_CARDS.find(card => card.tier === tier)!;
}

// სრული შედარება ფასების და გეგმების გვერდზე. true/false — შედის თუ არა, ტექსტი — ლიმიტი.
export type ComparisonValue = boolean | string;
export type ComparisonGroup = { title: string; icon: string; rows: { label: string; values: Record<PaidTier, ComparisonValue> }[] };

const row = (label: string, start: ComparisonValue, business: ComparisonValue, pro: ComparisonValue) =>
    ({ label, values: { START: start, BUSINESS: business, PRO: pro } });

export const PLAN_COMPARISON: readonly ComparisonGroup[] = [
    {
        title: "შეკვეთები და მომხმარებლები", icon: "solar:bag-4-bold-duotone", rows: [
            row("შეკვეთები თვეში", n(PLAN_LIMITS.START.ordersPerPeriod), n(PLAN_LIMITS.BUSINESS.ordersPerPeriod), "ულიმიტო"),
            row("ინვოისი QR კოდით, ჯგუფური ბეჭდვა", true, true, true),
            row("შეკვეთის ბმული მომხმარებლისთვის", true, true, true),
            row("დაბრუნება, გაცვლა, თანხის დაბრუნება", true, true, true),
            row("მომხმარებლების ბაზა", true, true, true),
            row("ფოტო შეკვეთაში", false, true, true),
            row("პროდუქტი მარაგიდან შეკვეთაში", false, true, true),
        ],
    },
    {
        title: "მარაგი, შესყიდვები, წარმოება", icon: "solar:box-bold-duotone", rows: [
            row("შესყიდვები ფოტოებით და შესაძენი სია", false, true, true),
            row("მარაგი, ინვენტარიზაცია, ჩამოწერა", false, true, true),
            row("მასალები და წარმოება", false, true, true),
            row("ბიზნესის მიმართულება", "იმპორტი", "იმპორტი ან წარმოება", "ორივე ერთად"),
            row("ფაილიდან იმპორტი", false, true, true),
        ],
    },
    {
        title: "ფინანსები და ანგარიშები", icon: "solar:chart-2-bold-duotone", rows: [
            row("ანალიტიკა, ხარჯები, მოგება", true, true, true),
            row("სტატისტიკა", true, true, true),
            row("ბიზნესის ანგარიში ბუღალტრისთვის", false, true, true),
            row("მარაგის უწყისი", false, true, true),
        ],
    },
    {
        title: "მართეო AI", icon: "solar:magic-stick-3-bold-duotone", rows: [
            row("კითხვები თვეში", false, n(PLAN_LIMITS.BUSINESS.aiQuestions), n(PLAN_LIMITS.PRO.aiQuestions)),
            row("შესყიდვა ფაილიდან", false, n(PLAN_LIMITS.BUSINESS.aiFiles), "ულიმიტო"),
            row("კვირის შეჯამება", false, true, true),
        ],
    },
    {
        title: "მომხმარებელთან კავშირი", icon: "solar:chat-round-line-bold-duotone", rows: [
            row("SMS შეკვეთის გაგზავნისას", false, "პაკეტით", `${PLAN_LIMITS.PRO.smsIncluded} / თვე + პაკეტები`),
            row("კონტენტ-კალენდარი", true, true, true),
        ],
    },
    {
        title: "გუნდი და ბიზნესები", icon: "solar:users-group-rounded-bold-duotone", rows: [
            row("თანამფლობელები", false, String(PLAN_LIMITS.BUSINESS.coOwners), String(PLAN_LIMITS.PRO.coOwners)),
            row("თანამშრომლები უფლებებით", String(PLAN_LIMITS.START.staff), String(PLAN_LIMITS.BUSINESS.staff), String(PLAN_LIMITS.PRO.staff)),
            row("დამატებითი ბიზნესი", false, "−25%", "−25%"),
        ],
    },
];

// SMS პაკეტები: ერთჯერადი შეძენა, ვადა არ გასდით.
export const SMS_PACKS = [
    { count: 200, price: 12 },
    { count: 500, price: 30 },
    { count: 1000, price: 55 },
    { count: 2000, price: 100 },
] as const;
