import { Icon } from "@iconify/react";
import Link from "next/link";
import type { EmailLogRow } from "@/lib/admin/email-log";
import { EMAIL_KIND_LABELS, EMAIL_STATUS } from "@/lib/admin/email-labels";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";

const when = (iso: string) => `${formatSupportDate(iso)}, ${formatSupportTime(iso)}`;

// „გაიგზავნა“ ნიშნავს, რომ Resend-მა მიიღო; შემდეგ წერილი შეიძლება სპამში მოხვდეს.
export default function EmailLogList({ rows, showRecipient = false, empty }: { rows: EmailLogRow[]; showRecipient?: boolean; empty: string }) {
    if (!rows.length) return <p className="text-sm text-text-secondary">{empty}</p>;
    return <ul className="flex flex-col">
        {rows.map(row => {
            const status = EMAIL_STATUS[row.status] ?? { label: row.status, tone: "bg-background text-text-secondary", icon: "solar:letter-linear" };
            return <li key={row.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${status.tone}`}><Icon icon={status.icon} className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                        {EMAIL_KIND_LABELS[row.kind] ?? row.kind}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${status.tone}`}>{status.label}</span>
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                        {when(row.createdAt)}
                        {showRecipient && <> · <Link href={`/admin/emails?q=${encodeURIComponent(row.recipient)}`} prefetch={false} className="hover:text-accent">{row.recipient}</Link></>}
                        {row.error ? ` · ${row.error}` : ""}
                    </p>
                </div>
            </li>;
        })}
    </ul>;
}
