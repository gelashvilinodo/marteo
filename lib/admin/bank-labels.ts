// ბარათით გადახდის სტატუსების ტექსტები: სერვერის გვერდიც და კლიენტის პანელიც იყენებს.

const STUCK_AFTER_MS = 30 * 60_000;

export const BANK_KIND_LABELS: Record<string, string> = { CHECKOUT: "გადახდა ბარათით", RENEWAL: "ავტოგანახლება", SMS_PACK: "SMS პაკეტი" };
export const BANK_INTERVAL_LABELS: Record<string, string> = { MONTHLY: "თვიური", YEARLY: "წლიური" };

// ბანკის ნედლი სტატუსი ადმინისთვის გასაგებად.
const BANK_STATUS_TEXT: Record<string, string> = {
    created: "ბანკის გვერდზე ელოდება", processing: "მუშავდება", completed: "ჩამოიჭრა", rejected: "ბანკმა უარყო",
    request_failed: "ბანკამდე ვერ მივიდა", amount_mismatch: "თანხა არ ემთხვევა (შეამოწმეთ ბანკში)",
    refund_requested: "დაბრუნება მოთხოვნილია", refunded: "თანხა დაბრუნდა", refunded_partially: "ნაწილობრივ დაბრუნდა",
};

export function bankBadge(attempt: { status: string; refundedAt: string | null; bankStatus: string | null; createdAt: string }, now = Date.now()) {
    if (attempt.refundedAt) return attempt.bankStatus === "refunded"
        ? { label: "დაბრუნებული", tone: "bg-violet-500/12 text-violet-500", icon: "solar:undo-left-round-linear" }
        : { label: "დაბრუნება მიმდინარეობს", tone: "bg-violet-500/12 text-violet-500", icon: "solar:undo-left-round-linear" };
    if (attempt.status === "COMPLETED") return { label: "წარმატებული", tone: "bg-success/12 text-success", icon: "solar:check-circle-linear" };
    if (attempt.status === "REJECTED") return { label: "უარყოფილი", tone: "bg-danger/12 text-danger", icon: "solar:close-circle-linear" };
    const stuck = now - new Date(attempt.createdAt).getTime() > STUCK_AFTER_MS;
    return stuck
        ? { label: "გაჭედილი", tone: "bg-amber-500/12 text-amber-600", icon: "solar:danger-triangle-linear" }
        : { label: "მოლოდინში", tone: "bg-background text-text-secondary", icon: "solar:clock-circle-linear" };
}

export function bankStatusText(status: string | null) {
    return status ? BANK_STATUS_TEXT[status] ?? status : null;
}
