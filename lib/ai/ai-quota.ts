// Shared by the server (limit checks) and the AI panel (the remaining-uses ring).

// Questions plus purchase files per calendar month in Tbilisi. Chat titles do not count.
export const AI_MONTHLY_LIMITS = { FREE: 30, START: 200, BUSINESS: 500, PRO: 1500 } as const;

// The ring turns to the upgrade offer once this share of the limit is used.
export const AI_QUOTA_WARN_SHARE = 0.8;

export type AiQuota = { plan: string; used: number; limit: number; disabled: boolean; custom: boolean; resetsAt: string };

const tbilisiMonth = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit" }).format(date);

export function tbilisiMonthStart(now = new Date()) {
    return new Date(`${tbilisiMonth(now)}-01T00:00:00+04:00`);
}

// Intl has no Georgian month names in every browser, so the dative ("1 დეკემბერს") is written out.
const MONTHS_DATIVE = ["იანვარს", "თებერვალს", "მარტს", "აპრილს", "მაისს", "ივნისს", "ივლისს", "აგვისტოს", "სექტემბერს", "ოქტომბერს", "ნოემბერს", "დეკემბერს"];

export function formatResetDay(iso: string) {
    const [, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date(iso)).split("-").map(Number);
    return `${day} ${MONTHS_DATIVE[month - 1]}`;
}

export function nextTbilisiMonthStart(now = new Date()) {
    const [year, month] = tbilisiMonth(now).split("-").map(Number);
    return new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7)}-01T00:00:00+04:00`);
}
