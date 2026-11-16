import { Icon } from "@iconify/react";
import Link from "next/link";
import type { AuditEntry } from "@/lib/admin/actions";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import { SUBSCRIPTION_STATUS_LABELS as STATUS_LABELS, USER_STATUS_LABELS } from "./AdminBadges";

export const AUDIT_ACTIONS: Record<string, { label: string; icon: string }> = {
    "verify-email": { label: "ელფოსტა დადასტურდა ხელით", icon: "solar:letter-opened-linear" },
    "verify-phone": { label: "ტელეფონი დადასტურდა ხელით", icon: "solar:smartphone-linear" },
    "send-password-reset": { label: "გაიგზავნა პაროლის აღდგენის ბმული", icon: "solar:key-linear" },
    "end-sessions": { label: "გამოყვანილია ყველა მოწყობილობიდან", icon: "solar:logout-3-linear" },
    suspend: { label: "ანგარიში შეჩერდა", icon: "solar:lock-keyhole-minimalistic-linear" },
    unsuspend: { label: "ანგარიში აღდგა", icon: "solar:lock-keyhole-unlocked-linear" },
    subscription: { label: "პაკეტი შეიცვალა", icon: "solar:tag-price-linear" },
    "subscription-auto": { label: "პაკეტის სტატუსი შეიცვალა ვადის გამო", icon: "solar:clock-circle-linear" },
    "subscription-user": { label: "მფლობელმა შეცვალა პაკეტი", icon: "solar:user-check-linear" },
    payment: { label: "გადახდა აღირიცხა", icon: "solar:wallet-money-linear" },
    "payment-void": { label: "გადახდა გაუქმდა", icon: "solar:close-circle-linear" },
    "payment-bank": { label: "გადახდა ბარათით (ბანკი)", icon: "solar:card-linear" },
    "payment-refund": { label: "თანხა დაბრუნდა ბარათზე", icon: "solar:undo-left-round-linear" },
    "ai-settings": { label: "AI-ის პარამეტრები შეიცვალა", icon: "solar:magic-stick-3-linear" },
    "sms-pack": { label: "SMS პაკეტი დაემატა", icon: "solar:chat-round-line-linear" },
    "user-delete": { label: "ანგარიში წაიშალა", icon: "solar:user-cross-linear" },
    "business-delete": { label: "ბიზნესი წაიშალა (12 თვე გადაუხდელი)", icon: "solar:trash-bin-trash-linear" },
    "export-users": { label: "მომხმარებლების Excel ექსპორტი", icon: "solar:file-download-linear" },
    "export-businesses": { label: "ბიზნესების Excel ექსპორტი", icon: "solar:file-download-linear" },
    "export-payments": { label: "გადახდების Excel ექსპორტი", icon: "solar:file-download-linear" },
    "banner-create": { label: "ბანერი გამოქვეყნდა", icon: "solar:flag-linear" },
    "banner-cancel": { label: "ბანერი მოიხსნა", icon: "solar:flag-linear" },
    "admin-2fa-enable": { label: "ორეტაპიანი შესვლა ჩაირთო", icon: "solar:shield-check-linear" },
    "admin-2fa-reset": { label: "ორეტაპიანი შესვლა თავიდან ჩასართავად გაუქმდა", icon: "solar:shield-warning-linear" },
    "admin-device-trust": { label: "ადმინში შესვლა ახალი მოწყობილობიდან", icon: "solar:devices-linear" },
    "admin-device-revoke": { label: "სანდო მოწყობილობა გაუქმდა", icon: "solar:devices-linear" },
    "admin-backup-used": { label: "გამოყენებულია სარეზერვო კოდი", icon: "solar:key-linear" },
    "admin-backup-regenerate": { label: "შეიქმნა ახალი სარეზერვო კოდები", icon: "solar:key-linear" },
    "errors-resolve": { label: "შეცდომები მოგვარებულად მოინიშნა", icon: "solar:checklist-minimalistic-linear" },
};

const money = (value: unknown) => `${Number(value).toFixed(2)} ₾`;

type Plain = Record<string, unknown> | null;

function subscriptionText(value: Plain) {
    if (!value) return "პაკეტის გარეშე";
    const expires = typeof value.expiresAt === "string" ? `${formatSupportDate(value.expiresAt)}-მდე` : "უვადო";
    return `${value.plan} · ${STATUS_LABELS[String(value.status)] ?? value.status} · ${expires}`;
}

function detail(entry: AuditEntry) {
    const before = entry.before as Plain;
    const after = entry.after as Plain;
    if (entry.action === "subscription" || entry.action === "subscription-auto" || entry.action === "subscription-user") return `${subscriptionText(before)} → ${subscriptionText(after)}`;
    if (entry.action === "payment") return `${money(after?.amount)} · ${after?.months} თვე · ${subscriptionText(after)}`;
    if (entry.action === "sms-pack") return `${after?.count} SMS · ნაშთი ${after?.balance}`;
    if (entry.action.startsWith("export-")) return after?.rows !== undefined ? `${after.rows} ჩანაწერი` : "";
    if (entry.action === "banner-create") return typeof after?.message === "string" ? after.message : "";
    if (entry.action === "errors-resolve") return after?.count !== undefined ? `${after.count} შეცდომა` : "";
    if (entry.action === "ai-settings") {
        const text = (value: Plain) => `${value?.disabled ? "გამორთული" : "ჩართული"} · ლიმიტი ${value?.monthlyLimit ?? "პაკეტის მიხედვით"}`;
        return `${text(before)} → ${text(after)}`;
    }
    if (entry.action === "payment-bank") return `${money(after?.amount)} · ${subscriptionText(after)}`;
    if (entry.action === "payment-refund") return `${money(after?.amount)} · ${after?.plan} · ${after?.endPlan ? "გეგმა გაითიშა" : "გეგმა დარჩა"} · ${after?.reason ?? ""}`;
    if (entry.action === "payment-void") return `${money(after?.amount)} · ${after?.plan} · ${after?.reason ?? ""}`;
    if (entry.action === "user-delete") {
        const deleted = Array.isArray(after?.businessesDeleted) ? after.businessesDeleted as string[] : [];
        return `${deleted.length ? `წაიშალა ბიზნესი: ${deleted.join(", ")}` : "ბიზნესი არ წაშლილა"}${after?.businessesLeft ? ` · დატოვა ${after.businessesLeft}` : ""}`;
    }
    if (entry.action === "admin-device-trust") return `${after?.label ?? ""}${after?.remember === false ? " · მხოლოდ ამ სესიაზე" : " · 30 დღე"}`;
    if (entry.action === "admin-device-revoke") return after?.scope === "current" ? "ამ მოწყობილობიდან გასვლა" : `${after?.count ?? 1} მოწყობილობა`;
    if (entry.action === "admin-backup-used") return `დარჩა ${after?.left ?? 0}`;
    if (entry.action === "send-password-reset") return after?.email ? String(after.email) : "";
    if (entry.action === "end-sessions") return `${before?.sessions ?? 0} მოწყობილობა`;
    if (before?.status && after?.status && before.status !== after.status) {
        return `სტატუსი: ${USER_STATUS_LABELS[String(before.status)] ?? before.status} → ${USER_STATUS_LABELS[String(after.status)] ?? after.status}`;
    }
    return "";
}

export type AuditTarget = { label: string; href: string | null };

export default function AuditHistory({ entries, targets }: { entries: AuditEntry[]; targets?: Record<string, AuditTarget> }) {
    if (!entries.length) return <p className="text-sm text-text-secondary">ადმინ პანელიდან ცვლილება ჯერ არ გაკეთებულა.</p>;
    return <ol className="flex flex-col">
        {entries.map(entry => {
            const meta = AUDIT_ACTIONS[entry.action] ?? { label: entry.action, icon: "solar:pen-linear" };
            const target = targets?.[entry.id];
            const text = detail(entry);
            return <li key={entry.id} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-text-secondary"><Icon icon={meta.icon} className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{meta.label}
                        {target && <> · {target.href
                            ? <Link href={target.href} prefetch={false} className="text-accent hover:underline">{target.label}</Link>
                            : <span className="text-text-secondary">{target.label}</span>}</>}
                    </p>
                    {text && <p className="break-words text-xs text-text-secondary">{text}</p>}
                    <p className="mt-0.5 text-[11px] text-text-secondary">{formatSupportDate(entry.createdAt)}, {formatSupportTime(entry.createdAt)} · {entry.adminName ?? (entry.action === "subscription-auto" ? "ავტომატურად" : entry.action === "subscription-user" ? "მფლობელი" : "წაშლილი ადმინი")}</p>
                </div>
            </li>;
        })}
    </ol>;
}
