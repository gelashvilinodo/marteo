// „როგორ მუშაობს" დემოს მონაცემები: პატარა ხელნაკეთი ნივთების მაღაზია, ერთი თვე.
// ციფრები ერთმანეთს ემთხვევა: ახალი შეკვეთა (38 ₾, თვითღირებულება 14.50 ₾) ყველა გვერდზე ერთნაირად აისახება.

export type DemoProduct = {
    id: string;
    name: string;
    sku: string;
    variant: string;
    category: string;
    price: number;
    stock: number;
    icon: string;
    tint: string;
    status: "ok" | "low" | "out";
};

export const products: DemoProduct[] = [
    { id: "lavender", name: "სოიის სანთელი · ლავანდა", sku: "P-000012", variant: "იისფერი · 200 გ", category: "სანთლები", price: 38, stock: 14, icon: "fluent-emoji-flat:candle", tint: "from-violet-400/25 to-violet-200/10", status: "ok" },
    { id: "cup", name: "კერამიკული ფინჯანი", sku: "P-000004", variant: "ცისფერი · 350 მლ", category: "კერამიკა", price: 32, stock: 9, icon: "fluent-emoji-flat:teacup-without-handle", tint: "from-sky-400/25 to-sky-200/10", status: "ok" },
    { id: "vanilla", name: "სოიის სანთელი · ვანილი", sku: "P-000013", variant: "კრემისფერი · 200 გ", category: "სანთლები", price: 38, stock: 22, icon: "fluent-emoji-flat:candle", tint: "from-amber-300/30 to-amber-100/10", status: "ok" },
    { id: "soap", name: "ხელნაკეთი საპონი · თაფლი", sku: "P-000021", variant: "120 გ", category: "საპონი", price: 14, stock: 41, icon: "fluent-emoji-flat:soap", tint: "from-yellow-300/30 to-yellow-100/10", status: "ok" },
    { id: "vase", name: "თიხის ვაზა", sku: "P-000007", variant: "ბუნებრივი · 24 სმ", category: "კერამიკა", price: 64, stock: 3, icon: "fluent-emoji-flat:amphora", tint: "from-orange-400/25 to-orange-200/10", status: "low" },
    { id: "pine", name: "სოიის სანთელი · ფიჭვი", sku: "P-000014", variant: "მწვანე · 200 გ", category: "სანთლები", price: 38, stock: 6, icon: "fluent-emoji-flat:candle", tint: "from-emerald-400/25 to-emerald-200/10", status: "ok" },
    { id: "scarf", name: "ნაქსოვი შარფი", sku: "P-000030", variant: "ღვინისფერი", category: "ქსოვილი", price: 95, stock: 0, icon: "fluent-emoji-flat:scarf", tint: "from-rose-400/25 to-rose-200/10", status: "out" },
];

export const ordered = products[0];
export const orderedCost = 14.5;
export const orderedAfterStock = ordered.stock - 1;

export const customer = {
    phone: "599 48 21 07",
    firstName: "მარიამ",
    lastName: "კვარაცხელია",
    zone: "თბილისი",
    address: "ვაჟა-ფშაველას 41, ბ. 12",
    district: "საბურთალო",
};

export const order = {
    number: "#0149",
    courier: 6,
    bank: "საქართველოს ბანკი",
    search: "სანთელი",
};

export const orderTotal = ordered.price + order.courier;

// მთავარი და ანალიტიკა: ერთი თვე.
export const month = {
    sales: 9864,
    cost: 4512.4,
    other: 1224.1,
    orders: 236,
    stockUnits: 486,
    stockKinds: 38,
};

export const monthProfit = month.sales - month.cost - month.other;

export const homeDays = [
    { day: 5, sales: 312, profit: 138 },
    { day: 6, sales: 446, profit: 201 },
    { day: 7, sales: 268, profit: 112 },
    { day: 8, sales: 521, profit: 236 },
    { day: 9, sales: 384, profit: 170 },
    { day: 10, sales: 297, profit: 128 },
    { day: 11, sales: 462, profit: 214 },
    { day: 12, sales: 355, profit: 151 },
    { day: 13, sales: 508, profit: 229 },
    { day: 14, sales: 214, profit: 96 },
];

export const expenses = [
    { label: "გაყიდული პროდუქტების ხარჯი", value: month.cost, color: "var(--marteo-warning)" },
    { label: "მიწოდება და შეფუთვა", value: 642.6, color: "var(--marteo-accent)" },
    { label: "რეკლამა", value: 480, color: "var(--marteo-success)" },
    { label: "სხვა", value: 101.5, color: "#94a3b8" },
];

export const existingOrders = [
    { number: "#0148", name: "ნინო ბერიძე", place: "ბათუმი", product: "კერამიკული ფინჯანი", count: 2, total: 70, status: "shipped", paid: true, icon: "fluent-emoji-flat:teacup-without-handle", tint: "from-sky-400/25 to-sky-200/10" },
    { number: "#0147", name: "გიორგი კაპანაძე", place: "თბილისი · ვაკე", product: "თიხის ვაზა", count: 1, total: 70, status: "completed", paid: true, icon: "fluent-emoji-flat:amphora", tint: "from-orange-400/25 to-orange-200/10" },
    { number: "#0146", name: "ანა წერეთელი", place: "ქუთაისი", product: "ხელნაკეთი საპონი · თაფლი", count: 3, total: 48, status: "processing", paid: false, icon: "fluent-emoji-flat:soap", tint: "from-yellow-300/30 to-yellow-100/10" },
    { number: "#0145", name: "ლუკა ჯავახიშვილი", place: "თბილისი · დიდუბე", product: "ნაქსოვი შარფი", count: 1, total: 101, status: "completed", paid: true, icon: "fluent-emoji-flat:scarf", tint: "from-rose-400/25 to-rose-200/10" },
    { number: "#0144", name: "თამარ გელაშვილი", place: "რუსთავი", product: "სოიის სანთელი · ვანილი", count: 2, total: 82, status: "completed", paid: true, icon: "fluent-emoji-flat:candle", tint: "from-amber-300/30 to-amber-100/10" },
] as const;

export const orderStatusStyle = {
    processing: { label: "მუშავდება", icon: "solar:clock-circle-linear", className: "bg-warning/10 text-warning" },
    shipped: { label: "გაგზავნილი", icon: "solar:delivery-linear", className: "bg-accent/10 text-accent" },
    completed: { label: "დასრულებული", icon: "solar:check-circle-linear", className: "bg-success/10 text-success" },
} as const;

// შეკვეთების გვერდის მრიცხველები: ერთი კვირა.
export const weekCounts = { total: 41, processing: 6, shipped: 9, completed: 25, cancelled: 1 };

export const analyticsWeek = [
    { day: "08", sales: 521 },
    { day: "09", sales: 384 },
    { day: "10", sales: 297 },
    { day: "11", sales: 462 },
    { day: "12", sales: 355 },
    { day: "13", sales: 508 },
    { day: "14", sales: 214 },
];

export function money(value: number, decimals = true) {
    const [integer, decimal] = Math.abs(value).toFixed(decimals ? 2 : 0).split(".");
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${value < 0 ? "−" : ""}${grouped}${decimal !== undefined ? `.${decimal}` : ""} ₾`;
}

export function group(value: number) {
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
