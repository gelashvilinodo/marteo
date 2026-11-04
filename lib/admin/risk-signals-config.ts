// Signals for businesses that may need a message from us; computed in risk-signals.ts.
// Shared with the support chat panel (client), so no server imports here.
export const RISK_KINDS = {
    lapsed: { label: "გადახდა არ შემოსულა", icon: "solar:wallet-money-bold-duotone", tone: "bg-danger/12 text-danger" },
    expiring: { label: "პაკეტი იწურება", icon: "solar:hourglass-bold-duotone", tone: "bg-warning/15 text-warning" },
    "ai-limit": { label: "AI ლიმიტი ამოიწურა", icon: "solar:magic-stick-3-bold-duotone", tone: "bg-violet-500/12 text-violet-500" },
    inactive: { label: "ფასიანი, მაგრამ არააქტიური", icon: "solar:moon-sleep-bold-duotone", tone: "bg-sky-500/12 text-sky-500" },
    onboarding: { label: "პირველი შეკვეთა არ აქვს", icon: "solar:rocket-2-bold-duotone", tone: "bg-accent/12 text-accent" },
} as const;

export type RiskKind = keyof typeof RISK_KINDS;
export const RISK_KIND_KEYS = Object.keys(RISK_KINDS) as RiskKind[];

export const EXPIRING_DAYS = 7;
export const LAPSED_DAYS = 30;
export const INACTIVE_DAYS = 14;
export const ONBOARDING_DAYS = { from: 3, to: 30 };

export type RiskSignal = { kind: RiskKind; detail: string };
