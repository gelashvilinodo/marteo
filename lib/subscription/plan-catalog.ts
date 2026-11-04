// გეგმების ქარდების ტექსტი: საჯარო ფასების გვერდი, გეგმის ფანჯარა და გეგმების გვერდი ერთსა და იმავეს აჩვენებს.
// ციფრები plans.ts-დან მოდის, რომ ქარდი და რეალური ლიმიტი არასდროს გაიყაროს.
import { PLAN_LIMITS, PLAN_PRICES, TRIAL_DAYS, type PaidTier } from "./plans";

export type PlanRow = {
    icon: string;
    label: string;
    value?: string;
    // false: გადახაზული სტრიქონი (გეგმაში არ შედის).
    included?: boolean;
    // ხაზგასმული ხატულა (AI, ულიმიტო) ძირითადი ჩამონათვლისგან გამოსარჩევად.
    highlight?: boolean;
};

export type PlanCard = {
    tier: PaidTier;
    name: string;
    icon: string;
    tagline: string;
    audience: string;
    price: number;
    perDay: string;
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
            { icon: "solar:check-circle-linear", label: "შეკვეთები", value: n(PLAN_LIMITS.START.ordersPerPeriod) },
            { icon: "solar:check-circle-linear", label: "ინვოისი და შეკვეთის ბმული" },
            { icon: "solar:check-circle-linear", label: "დაბრუნება და გაცვლა" },
            { icon: "solar:check-circle-linear", label: "მომხმარებლების ბაზა" },
            { icon: "solar:check-circle-linear", label: "ანალიტიკა და სტატისტიკა" },
            { icon: "solar:check-circle-linear", label: "კონტენტ-კალენდარი" },
            { icon: "solar:close-circle-linear", label: "მარაგი და შესყიდვები", included: false },
            { icon: "solar:close-circle-linear", label: "ფოტოები შეკვეთაში", included: false },
            { icon: "solar:close-circle-linear", label: "მართეო AI", included: false },
            { icon: "solar:close-circle-linear", label: "ფაილიდან იმპორტი", included: false },
            { icon: "solar:close-circle-linear", label: "გუნდი", included: false },
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
            { icon: "solar:check-circle-linear", label: "შეკვეთები", value: n(PLAN_LIMITS.BUSINESS.ordersPerPeriod) },
            { icon: "solar:check-circle-linear", label: "შესყიდვები და მარაგი, ფოტოებით" },
            { icon: "solar:check-circle-linear", label: "იმპორტი ან წარმოება" },
            { icon: "solar:check-circle-linear", label: "ბიზნესის ანგარიში, მარაგის უწყისი" },
            { icon: "solar:check-circle-linear", label: "ფაილიდან იმპორტი" },
            { icon: "solar:magic-stick-3-linear", label: "მართეო AI", value: n(PLAN_LIMITS.BUSINESS.aiQuestions), highlight: true },
            { icon: "solar:document-add-linear", label: "შესყიდვა ფაილიდან", value: n(PLAN_LIMITS.BUSINESS.aiFiles), highlight: true },
            { icon: "solar:users-group-rounded-linear", label: "გუნდი", value: team("BUSINESS") },
            { icon: "solar:chat-round-line-linear", label: "SMS მყიდველთან", value: "პაკეტით" },
            { icon: "solar:sale-linear", label: "ახალი ბიზნესი", value: "−25%" },
            { icon: "solar:close-circle-linear", label: "იმპორტი და წარმოება ერთად", included: false },
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
        badge: "ყველაზე მომგებიანი",
        includesPrevious: "ბიზნესი, პლუს:",
        rows: [
            { icon: "solar:infinity-linear", label: "შეკვეთები", value: "ულიმიტო", highlight: true },
            { icon: "solar:magic-stick-3-linear", label: "მართეო AI", value: n(PLAN_LIMITS.PRO.aiQuestions), highlight: true },
            { icon: "solar:document-add-linear", label: "შესყიდვა ფაილიდან", value: "ულიმიტო", highlight: true },
            { icon: "solar:chat-round-line-linear", label: "SMS მყიდველთან", value: n(PLAN_LIMITS.PRO.smsIncluded), highlight: true },
            { icon: "solar:check-circle-linear", label: "იმპორტი და წარმოება ერთად" },
            { icon: "solar:users-group-rounded-linear", label: "გუნდი", value: team("PRO") },
            { icon: "solar:sale-linear", label: "ყოველი ახალი ბიზნესი", value: "−25%" },
        ],
    },
];

export const TRIAL_PITCH = `${TRIAL_DAYS} დღე უფასოდ · ყველა ფუნქცია · ${PLAN_LIMITS.TRIAL.aiQuestions} AI კითხვა`;
export const PLAN_FINE_PRINT = "ყოველთვიური გადახდა · გააუქმე ნებისმიერ დროს · პირველ 3 დღეში თანხა ბრუნდება";

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
            row("შეკვეთის ბმული მყიდველისთვის", true, true, true),
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
        title: "მყიდველთან კავშირი", icon: "solar:chat-round-line-bold-duotone", rows: [
            row("SMS შეკვეთის გაგზავნისას", false, "პაკეტით", `${PLAN_LIMITS.PRO.smsIncluded} / თვე + პაკეტები`),
            row("კონტენტ-კალენდარი", true, true, true),
        ],
    },
    {
        title: "გუნდი და ბიზნესები", icon: "solar:users-group-rounded-bold-duotone", rows: [
            row("თანამფლობელები", false, String(PLAN_LIMITS.BUSINESS.coOwners), String(PLAN_LIMITS.PRO.coOwners)),
            row("თანამშრომლები უფლებებით", false, String(PLAN_LIMITS.BUSINESS.staff), String(PLAN_LIMITS.PRO.staff)),
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
