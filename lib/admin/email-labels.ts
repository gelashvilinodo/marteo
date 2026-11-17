// ელფოსტის ჟურნალის ტექსტები (სერვერის გვერდებიც და კომპონენტებიც იყენებს).
export const EMAIL_KIND_LABELS: Record<string, string> = {
    verification: "დადასტურების კოდი", "password-reset": "პაროლის აღდგენა", "email-change": "ელფოსტის შეცვლის კოდი",
    "team-invite": "მოწვევა ბიზნესში", "admin-invite": "მოწვევა ადმინად", notice: "შეტყობინება (გეგმა, გადახდა)",
};

export const EMAIL_STATUS: Record<string, { label: string; tone: string; icon: string }> = {
    SENT: { label: "გაიგზავნა", tone: "bg-success/12 text-success", icon: "solar:letter-opened-linear" },
    FAILED: { label: "ვერ გაიგზავნა", tone: "bg-danger/12 text-danger", icon: "solar:letter-unread-linear" },
    LIMITED: { label: "ლიმიტი (არ გაიგზავნა)", tone: "bg-amber-500/12 text-amber-600", icon: "solar:clock-circle-linear" },
};
