import { Icon } from "@iconify/react";
import type { AuditEntry } from "@/lib/admin/actions";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import { SUBSCRIPTION_STATUS_LABELS as STATUS_LABELS, USER_STATUS_LABELS } from "./AdminBadges";

const ACTIONS: Record<string, { label: string; icon: string }> = {
    "verify-email": { label: "ელფოსტა დადასტურდა ხელით", icon: "solar:letter-opened-linear" },
    "verify-phone": { label: "ტელეფონი დადასტურდა ხელით", icon: "solar:smartphone-linear" },
    "send-password-reset": { label: "გაიგზავნა პაროლის აღდგენის ბმული", icon: "solar:key-linear" },
    "end-sessions": { label: "გამოყვანილია ყველა მოწყობილობიდან", icon: "solar:logout-3-linear" },
    suspend: { label: "ანგარიში შეჩერდა", icon: "solar:lock-keyhole-minimalistic-linear" },
    unsuspend: { label: "ანგარიში აღდგა", icon: "solar:lock-keyhole-unlocked-linear" },
    subscription: { label: "პაკეტი შეიცვალა", icon: "solar:tag-price-linear" },
};

type Plain = Record<string, unknown> | null;

function subscriptionText(value: Plain) {
    if (!value) return "პაკეტის გარეშე";
    const expires = typeof value.expiresAt === "string" ? `${formatSupportDate(value.expiresAt)}-მდე` : "უვადო";
    return `${value.plan} · ${STATUS_LABELS[String(value.status)] ?? value.status} · ${expires}`;
}

function detail(entry: AuditEntry) {
    const before = entry.before as Plain;
    const after = entry.after as Plain;
    if (entry.action === "subscription") return `${subscriptionText(before)} → ${subscriptionText(after)}`;
    if (entry.action === "send-password-reset") return after?.email ? String(after.email) : "";
    if (entry.action === "end-sessions") return `${before?.sessions ?? 0} მოწყობილობა`;
    if (before?.status && after?.status && before.status !== after.status) {
        return `სტატუსი: ${USER_STATUS_LABELS[String(before.status)] ?? before.status} → ${USER_STATUS_LABELS[String(after.status)] ?? after.status}`;
    }
    return "";
}

export default function AuditHistory({ entries }: { entries: AuditEntry[] }) {
    if (!entries.length) return <p className="text-sm text-text-secondary">ადმინ პანელიდან ცვლილება ჯერ არ გაკეთებულა.</p>;
    return <ol className="flex flex-col">
        {entries.map(entry => {
            const meta = ACTIONS[entry.action] ?? { label: entry.action, icon: "solar:pen-linear" };
            const text = detail(entry);
            return <li key={entry.id} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-text-secondary"><Icon icon={meta.icon} className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                    {text && <p className="break-words text-xs text-text-secondary">{text}</p>}
                    <p className="mt-0.5 text-[11px] text-text-secondary">{formatSupportDate(entry.createdAt)}, {formatSupportTime(entry.createdAt)} · {entry.adminName ?? "წაშლილი ადმინი"}</p>
                </div>
            </li>;
        })}
    </ol>;
}
