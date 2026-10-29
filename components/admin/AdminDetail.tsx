import { Icon } from "@iconify/react";
import Link from "next/link";
import type { ReactNode } from "react";

export function BackLink({ href, label }: { href: string; label: string }) {
    return <Link href={href} prefetch={false} className="inline-flex items-center gap-1 text-sm text-text-secondary transition hover:text-accent">
        <Icon icon="solar:alt-arrow-left-linear" className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>;
}

export function Stat({ icon, label, value, tone }: { icon: string; label: string; value: ReactNode; tone: string }) {
    return <div className="rounded-2xl border border-border bg-surface p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon icon={icon} className="h-5 w-5" aria-hidden="true" /></span>
        <p className="mt-3 text-xl font-semibold text-text-primary">{value}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </div>;
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
    return <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {action}
        </div>
        <div className="mt-3">{children}</div>
    </section>;
}

export function InfoRow({ icon, label, children, href }: { icon: string; label: string; children: ReactNode; href?: string }) {
    return <div className="flex gap-3 border-b border-border py-2.5 last:border-0">
        <Icon icon={icon} className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-secondary">{label}</p>
            {href
                ? <a href={href} className="block break-words text-sm text-accent hover:underline" {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>
                : <div className="break-words text-sm text-text-primary">{children}</div>}
        </div>
    </div>;
}
