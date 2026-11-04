import "server-only";
import { redirect } from "next/navigation";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { planDenial, type PlanCheck } from "@/lib/subscription/plan-access";
import { LOCKED_OPEN_SECTIONS } from "@/lib/subscription/plan-state";
import {
    DASHBOARD_SECTIONS,
    firstAllowedDashboardPath,
    meetsNeed,
    type AccessLevel,
    type SectionNeed,
} from "./permissions";

// ყველა ბიზნესის API როუტი და გვერდი აქედან ამოწმებს წვდომას.
// scripts/check-business-access.mjs ბილდის დროს ამოწმებს, რომ არცერთი გამოგვრჩეს.
// აქტიური ბიზნესი იგივე cookie-დან ირჩევა, რასაც როუტის მონაცემების წაკითხვა იყენებს.

export type AccessNeed = SectionNeed;

const deny = (message: string, status: number) => Response.json(
    { success: false, error: message, message },
    { status, headers: { "Cache-Control": "private, no-store" } },
);

export async function getBusinessAccess() {
    return (await getPgDashboardContext())?.membership?.access ?? null;
}

// აბრუნებს Response-ს, თუ წვდომა არ არის, თორემ null-ს.
// "MEMBER" ნიშნავს ბიზნესის ნებისმიერ აქტიურ წევრს.
// plan: გეგმის ფუნქცია ან მხოლოდ ნახვის რეჟიმში დაშვებული ცვლილება. გეგმის უარი 402-ია
// და code ველით კლიენტი გეგმის ფანჯარას ხსნის.
export async function apiAccessDenied(need: AccessNeed, level: AccessLevel = "view", plan: PlanCheck = {}) {
    const context = await getPgDashboardContext();
    if (!context) return deny("გაიარე ავტორიზაცია.", 401);
    const access = context.membership?.access;
    if (!access) return deny("ბიზნესი ვერ მოიძებნა.", 403);
    if (meetsNeed(access, need, level)) {
        const denial = planDenial(context.membership?.plan, need, level, plan);
        if (!denial) return null;
        return Response.json(
            { success: false, error: denial.message, ...denial },
            { status: 402, headers: { "Cache-Control": "private, no-store" } },
        );
    }
    if (level === "edit" && access.readOnly && need !== "OWNER") {
        return deny("შენ მხოლოდ ნახვის უფლება გაქვს.", 403);
    }
    return deny(need === "OWNER" ? "ეს მხოლოდ ბიზნესის მფლობელს შეუძლია." : "ამ განყოფილებაზე წვდომა არ გაქვს.", 403);
}

// გვერდისთვის: უფლების გარეშე მომხმარებელი პირველ ნებადართულ განყოფილებაზე გადადის,
// გეგმით დაკეტილი გვერდიდან კი მთავარზე, სადაც გეგმის ფანჯარა იხსნება.
export async function requirePageAccess(need: AccessNeed, level: AccessLevel = "view", plan: PlanCheck = {}) {
    const context = await getPgDashboardContext();
    if (!context) redirect("/login");
    const access = context.membership?.access;
    if (!access) redirect("/business/onboarding");
    if (!meetsNeed(access, need, level)) redirect(firstAllowedDashboardPath(access));
    const denial = planDenial(context.membership!.plan, need, level, plan);
    if (denial) redirect(planRedirect(access, denial.feature ?? "locked"));
    return context.membership!;
}

// გეგმით დაკეტილი გვერდიდან პირველ ღია განყოფილებაზე (მფლობელისთვის მთავარზე), სადაც გეგმის ფანჯარა იხსნება.
// ღია განყოფილებებიდან არჩევა თავიდან იცავს გადამისამართების წრეს თანამშრომლისთვის.
function planRedirect(access: Parameters<typeof meetsNeed>[0], reason: string) {
    const path = DASHBOARD_SECTIONS.find(section => LOCKED_OPEN_SECTIONS.includes(section.path) && meetsNeed(access, section.need))?.path ?? "/dashboard/profile";
    return `${path}?upgrade=${reason}`;
}

export async function requireDashboardSection(path: string) {
    const section = DASHBOARD_SECTIONS.find(item => item.path === path);
    if (!section) throw new Error(`Unknown dashboard section: ${path}`);
    const context = await getPgDashboardContext();
    const plan = context?.membership?.plan;
    // მხოლოდ ნახვის რეჟიმში ღია განყოფილებების გარდა ყველაფერი იკეტება.
    if (plan?.locked && !LOCKED_OPEN_SECTIONS.includes(path) && context?.membership && meetsNeed(context.membership.access, section.need)) {
        redirect(planRedirect(context.membership.access, "locked"));
    }
    return requirePageAccess(section.need, "view", { feature: section.feature });
}
