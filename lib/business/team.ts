// გუნდის (თანამფლობელები და თანამშრომლები) საერთო მონაცემები.
// კლიენტზეც გამოიყენება, ამიტომ აქ სერვერის კოდი არ უნდა იყოს.
import { PLAN_LIMITS } from "@/lib/subscription/plans";
import type { BusinessPermission } from "./permissions";

export const INVITE_LIFETIME_HOURS = 12;
export const INVITE_MAX_RESENDS = 3;
export const INVITE_RESEND_COOLDOWN_SECONDS = 120;

// FREE: გეგმა არასდროს ყოფილა. დაბლოკილი ბიზნესი ბოლო ფასიანი გეგმის ლიმიტს ინარჩუნებს.
export type TeamPlan = "FREE" | "TRIAL" | "START" | "BUSINESS" | "PRO";

// თანამფლობელი = მფლობელის გარდა დამატებული OWNER. ლიმიტები lib/subscription/plans.ts-შია.
export const TEAM_LIMITS: Record<TeamPlan, { coOwners: number; staff: number }> = {
    FREE: { coOwners: 0, staff: 0 },
    TRIAL: { coOwners: PLAN_LIMITS.TRIAL.coOwners, staff: PLAN_LIMITS.TRIAL.staff },
    START: { coOwners: PLAN_LIMITS.START.coOwners, staff: PLAN_LIMITS.START.staff },
    BUSINESS: { coOwners: PLAN_LIMITS.BUSINESS.coOwners, staff: PLAN_LIMITS.BUSINESS.staff },
    PRO: { coOwners: PLAN_LIMITS.PRO.coOwners, staff: PLAN_LIMITS.PRO.staff },
};

export const PERMISSION_OPTIONS: ReadonlyArray<{
    value: BusinessPermission;
    label: string;
    icon: string;
    can: string;
    cannot: string;
}> = [
    {
        value: "ORDERS", label: "შეკვეთები", icon: "solar:bag-4-bold-duotone",
        can: "აფორმებს და არედაქტირებს შეკვეთებს, ხედავს კლიენტებს.",
        cannot: "ვერ ხედავს თვითღირებულებას, მოგებას და ხარჯებს.",
    },
    {
        value: "INVENTORY", label: "მარაგი", icon: "solar:box-bold-duotone",
        can: "აკონტროლებს ნაშთებს, ატარებს აღწერას და ჩამოწერას.",
        cannot: "ვერ აფორმებს შეკვეთებს.",
    },
    {
        value: "PURCHASES", label: "შესყიდვები", icon: "solar:cart-large-2-bold-duotone",
        can: "ქმნის და იღებს პარტიებს, მართავს შესასყიდ სიას.",
        cannot: "ხედავს შესყიდვის ფასებს, მაგრამ არა მოგებას.",
    },
    {
        value: "PRODUCTION", label: "წარმოება", icon: "solar:structure-bold-duotone",
        can: "აღრიცხავს წარმოებას და მასალების ხარჯვას.",
        cannot: "ვერ ხედავს ფინანსებს.",
    },
    {
        value: "CONTENT", label: "კონტენტი", icon: "solar:gallery-wide-bold-duotone",
        can: "გეგმავს პოსტებს კონტენტ-კალენდარში.",
        cannot: "ვერ ხედავს შეკვეთებს და ფინანსებს.",
    },
    {
        value: "FINANCE", label: "ფინანსები", icon: "solar:chart-2-bold-duotone",
        can: "ხედავს მოგებას, ხარჯებს, სტატისტიკას და კურიერის ანგარიშსწორებას.",
        cannot: "ბიზნესის პარამეტრებს და გუნდს ვერ მართავს.",
    },
];

export type TeamMember = {
    id: string;
    name: string;
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    permissions: BusinessPermission[];
    readOnly: boolean;
    status: "ACTIVE" | "FROZEN";
    isYou: boolean;
    isFounder: boolean;
    joinedAt: string;
};

export type TeamInvite = {
    id: string;
    email: string;
    role: "OWNER" | "MEMBER";
    permissions: BusinessPermission[];
    readOnly: boolean;
    expiresAt: string;
    expired: boolean;
    resendsLeft: number;
    resendAvailableAt: string;
};

export type TeamRequestView = {
    id: string;
    kind: "REMOVE_MEMBER" | "DELETE_BUSINESS";
    targetName: string | null;
    requestedByName: string;
    requestedByYou: boolean;
    youApproved: boolean;
    waitingFor: string[];
};

export type TeamSnapshot = {
    plan: TeamPlan;
    requests: TeamRequestView[];
    limits: { coOwners: number; staff: number };
    used: { coOwners: number; staff: number };
    members: TeamMember[];
    invites: TeamInvite[];
};
