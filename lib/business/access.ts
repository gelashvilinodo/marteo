import "server-only";
import { redirect } from "next/navigation";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
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
export async function apiAccessDenied(need: AccessNeed, level: AccessLevel = "view") {
    const context = await getPgDashboardContext();
    if (!context) return deny("გაიარე ავტორიზაცია.", 401);
    const access = context.membership?.access;
    if (!access) return deny("ბიზნესი ვერ მოიძებნა.", 403);
    if (meetsNeed(access, need, level)) return null;
    if (level === "edit" && access.readOnly && need !== "OWNER") {
        return deny("შენ მხოლოდ ნახვის უფლება გაქვს.", 403);
    }
    return deny(need === "OWNER" ? "ეს მხოლოდ ბიზნესის მფლობელს შეუძლია." : "ამ განყოფილებაზე წვდომა არ გაქვს.", 403);
}

// გვერდისთვის: უფლების გარეშე მომხმარებელი პირველ ნებადართულ განყოფილებაზე გადადის.
export async function requirePageAccess(need: AccessNeed, level: AccessLevel = "view") {
    const context = await getPgDashboardContext();
    if (!context) redirect("/login");
    const access = context.membership?.access;
    if (!access) redirect("/business/onboarding");
    if (!meetsNeed(access, need, level)) redirect(firstAllowedDashboardPath(access));
    return context.membership!;
}

export async function requireDashboardSection(path: string) {
    const section = DASHBOARD_SECTIONS.find(item => item.path === path);
    if (!section) throw new Error(`Unknown dashboard section: ${path}`);
    return requirePageAccess(section.need);
}
