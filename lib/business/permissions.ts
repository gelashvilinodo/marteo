// ბიზნესის წევრის უფლებები. ეს ფაილი კლიენტზეც გამოიყენება, ამიტომ აქ
// მხოლოდ სუფთა ლოგიკაა. სერვერის შემოწმება lib/business/access.ts-შია.
export const BUSINESS_PERMISSIONS = ["ORDERS", "INVENTORY", "PURCHASES", "PRODUCTION", "CONTENT", "FINANCE"] as const;
export type BusinessPermission = typeof BUSINESS_PERMISSIONS[number];
export type AccessLevel = "view" | "edit";

export type BusinessAccess = {
    role: string;
    permissions: readonly string[];
    readOnly: boolean;
    status: string;
};

// OWNER არის მფლობელიც და თანამფლობელიც. ADMIN ძველი როლია, მოწვევით აღარ იქმნება
// და სრულ წვდომას ინარჩუნებს, ოღონდ მფლობელის მოქმედებების გარეშე.
export function isBusinessOwner(access: BusinessAccess | null | undefined) {
    return access?.status === "ACTIVE" && access.role === "OWNER";
}

export function isBusinessPermission(value: unknown): value is BusinessPermission {
    return BUSINESS_PERMISSIONS.includes(value as BusinessPermission);
}

// `need` ერთი უფლებაა ან სია, რომლიდანაც ერთი მაინც საკმარისია.
export function hasBusinessAccess(
    access: BusinessAccess | null | undefined,
    need: BusinessPermission | readonly BusinessPermission[],
    level: AccessLevel,
) {
    if (!access || access.status !== "ACTIVE") return false;
    if (access.role === "OWNER" || access.role === "ADMIN") return true;
    if (level === "edit" && access.readOnly) return false;
    const needed: readonly BusinessPermission[] = typeof need === "string" ? [need] : need;
    return needed.some(permission => access.permissions.includes(permission));
}

export function canManageBusinessArea(access: BusinessAccess | null | undefined, need: BusinessPermission | readonly BusinessPermission[]) {
    return hasBusinessAccess(access, need, "edit");
}

export type SectionNeed = BusinessPermission | readonly BusinessPermission[] | "OWNER" | "MEMBER";

// დაშბორდის განყოფილებები და მათი საჭირო უფლება (ნახვისთვის). თანმიმდევრობა
// განსაზღვრავს, სად გადავიდეს თანამშრომელი, რომელსაც საწყის გვერდზე წვდომა არ აქვს.
export const DASHBOARD_SECTIONS: ReadonlyArray<{ path: string; need: SectionNeed }> = [
    { path: "/dashboard", need: "FINANCE" },
    { path: "/dashboard/orders", need: "ORDERS" },
    { path: "/dashboard/customers", need: "ORDERS" },
    { path: "/dashboard/inventory", need: ["INVENTORY", "PURCHASES"] },
    { path: "/dashboard/purchases", need: "PURCHASES" },
    { path: "/dashboard/material-purchases", need: "PURCHASES" },
    { path: "/dashboard/material-inventory", need: ["INVENTORY", "PURCHASES", "PRODUCTION"] },
    { path: "/dashboard/production", need: "PRODUCTION" },
    { path: "/dashboard/calendar", need: "CONTENT" },
    { path: "/dashboard/analytics", need: "FINANCE" },
    { path: "/dashboard/statistics", need: "FINANCE" },
    { path: "/dashboard/import", need: "OWNER" },
    { path: "/dashboard/business-settings", need: "OWNER" },
    { path: "/dashboard/notifications", need: "MEMBER" },
    { path: "/dashboard/help", need: "MEMBER" },
    { path: "/dashboard/profile", need: "MEMBER" },
];

export function meetsNeed(access: BusinessAccess | null | undefined, need: SectionNeed, level: AccessLevel = "view") {
    if (need === "OWNER") return isBusinessOwner(access);
    if (need === "MEMBER") return access?.status === "ACTIVE";
    return hasBusinessAccess(access, need, level);
}

export function firstAllowedDashboardPath(access: BusinessAccess | null | undefined) {
    return DASHBOARD_SECTIONS.find(section => meetsNeed(access, section.need))?.path ?? "/dashboard/profile";
}
