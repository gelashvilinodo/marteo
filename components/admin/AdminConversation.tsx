"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import SupportChat from "@/components/support/SupportChat";
import SupportAvatar from "@/components/support/SupportAvatar";
import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";
import { formatSupportCount, formatSupportDate, type SupportThreadView } from "@/lib/support/support-config";

export type BusinessProfile = {
    id: string;
    name: string;
    logoUrl: string | null;
    mode: BusinessMode;
    phone: string | null;
    email: string | null;
    address: string | null;
    website: string | null;
    description: string | null;
    createdAt: string;
    subscription: { plan: string; status: string; expiresAt: string | null } | null;
    counts: { orders: number; customers: number; products: number };
    lastOrderAt: string | null;
    members: { id: string; role: "OWNER" | "ADMIN" | "MEMBER"; name: string; email: string; phone: string; avatarUrl: string | null; joinedAt: string }[];
};

type Status = "OPEN" | "CLOSED";

const roles = { OWNER: "მფლობელი", ADMIN: "ადმინი", MEMBER: "წევრი" } as const;
const subscriptionStatus: Record<string, string> = { ACTIVE: "აქტიური", TRIALING: "საცდელი", CANCELED: "გაუქმებული", EXPIRED: "ვადაგასული", PAST_DUE: "გადაუხდელი" };

function Row({ icon, label, children, href }: { icon: string; label: string; children: ReactNode; href?: string }) {
    const value = <span className="block break-words text-sm text-text-primary">{children}</span>;
    return <div className="flex gap-3 py-2">
        <Icon icon={icon} className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0">
            <span className="block text-[11px] text-text-secondary">{label}</span>
            {href ? <a href={href} className="block break-words text-sm text-accent hover:underline" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{children}</a> : value}
        </div>
    </div>;
}

function BusinessPanel({ profile }: { profile: BusinessProfile }) {
    const mode = BUSINESS_MODES.find(item => item.value === profile.mode);
    const website = profile.website && /^https?:\/\//i.test(profile.website) ? profile.website : profile.website ? `https://${profile.website}` : null;
    return <div className="flex flex-col gap-3">
        <section className="rounded-3xl border border-border bg-surface p-5 text-center">
            <SupportAvatar name={profile.name} imageUrl={profile.logoUrl} size="lg" className="mx-auto" />
            <h2 className="mt-3 break-words text-base font-semibold text-text-primary">{profile.name}</h2>
            <Link href={`/admin/businesses/${profile.id}`} prefetch={false} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                სრული პროფილი <Icon icon="solar:alt-arrow-right-linear" className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
                {mode && <Icon icon={mode.icon} className="h-3.5 w-3.5" aria-hidden="true" />}{mode?.label ?? profile.mode}
                <span aria-hidden="true">·</span>
                {profile.subscription ? `${profile.subscription.plan} · ${subscriptionStatus[profile.subscription.status] ?? profile.subscription.status}` : "FREE"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
                {([["შეკვეთა", profile.counts.orders], ["კლიენტი", profile.counts.customers], ["პროდუქტი", profile.counts.products]] as const).map(([label, value]) =>
                    <div key={label} className="rounded-2xl bg-background px-2 py-2.5">
                        <span className="block text-base font-semibold text-text-primary">{formatSupportCount(value)}</span>
                        <span className="block text-[10px] text-text-secondary">{label}</span>
                    </div>)}
            </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface px-5 py-3">
            <h3 className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">კონტაქტი</h3>
            {profile.phone && <Row icon="solar:phone-linear" label="ბიზნესის ტელეფონი" href={`tel:${profile.phone}`}>{profile.phone}</Row>}
            {profile.email && <Row icon="solar:letter-linear" label="ბიზნესის ელ-ფოსტა" href={`mailto:${profile.email}`}>{profile.email}</Row>}
            {website && <Row icon="solar:global-linear" label="ვებსაიტი" href={website}>{profile.website}</Row>}
            {profile.address && <Row icon="solar:map-point-linear" label="მისამართი">{profile.address}</Row>}
            <Row icon="solar:calendar-linear" label="რეგისტრაცია">{formatSupportDate(profile.createdAt)}</Row>
            <Row icon="solar:cart-large-2-linear" label="ბოლო შეკვეთა">{profile.lastOrderAt ? formatSupportDate(profile.lastOrderAt) : "ჯერ არ აქვს"}</Row>
            {profile.subscription?.expiresAt && <Row icon="solar:hourglass-linear" label="გამოწერის ვადა">{formatSupportDate(profile.subscription.expiresAt)}</Row>}
            {profile.description && <Row icon="solar:document-text-linear" label="აღწერა">{profile.description}</Row>}
        </section>

        <section className="rounded-3xl border border-border bg-surface px-5 py-3">
            <h3 className="pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">გუნდი · {profile.members.length}</h3>
            <ul className="flex flex-col gap-3 pb-2">
                {profile.members.map(member => <li key={member.id} className="flex gap-3">
                    <SupportAvatar name={member.name} imageUrl={member.avatarUrl} />
                    <div className="min-w-0 text-sm">
                        <p className="flex items-center gap-1.5 font-medium text-text-primary">
                            <Link href={`/admin/users/${member.id}`} prefetch={false} className="truncate hover:text-accent">{member.name}</Link>
                            <span className="shrink-0 rounded-full bg-background px-1.5 text-[10px] font-normal text-text-secondary">{roles[member.role]}</span>
                        </p>
                        <a href={`mailto:${member.email}`} className="block truncate text-xs text-accent hover:underline">{member.email}</a>
                        <a href={`tel:${member.phone}`} className="block truncate text-xs text-text-secondary hover:text-accent">{member.phone}</a>
                    </div>
                </li>)}
            </ul>
        </section>
    </div>;
}

export default function AdminConversation({ conversationId, initialStatus, profile }: { conversationId: string; initialStatus: Status; profile: BusinessProfile }) {
    const [status, setStatus] = useState<Status>(initialStatus);
    const [saving, setSaving] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const savingRef = useRef(false);

    // Polls report the stored status unless a change is still being saved.
    const onThread = useCallback((thread: SupportThreadView) => {
        if (!savingRef.current) setStatus(thread.status);
    }, []);

    useEffect(() => {
        if (!infoOpen) return;
        const close = (event: KeyboardEvent) => { if (event.key === "Escape") setInfoOpen(false); };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [infoOpen]);

    const toggle = async () => {
        const next: Status = status === "OPEN" ? "CLOSED" : "OPEN";
        savingRef.current = true;
        setSaving(true);
        setStatus(next);
        try {
            const response = await fetch(`/api/admin/support/conversations/${conversationId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
            });
            if (!response.ok) setStatus(status);
        } catch { setStatus(status); }
        finally { savingRef.current = false; setSaving(false); }
    };

    return <div className="-m-4 flex h-[calc(100dvh-4rem)] gap-5 p-3 sm:-m-6 sm:p-5 lg:-m-8 lg:p-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 min-w-0 flex-1">
            <SupportChat
                viewer="ADMIN"
                sound
                endpoint={`/api/admin/support/conversations/${conversationId}/messages`}
                business={{ name: profile.name, logoUrl: profile.logoUrl }}
                onThread={onThread}
                header={<>
                    <Link href="/admin/support" prefetch={false} aria-label="სიაში დაბრუნება" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white">
                        <Icon icon="solar:alt-arrow-left-linear" className="h-5 w-5" aria-hidden="true" />
                    </Link>
                    <SupportAvatar name={profile.name} imageUrl={profile.logoUrl} size="md" className="ring-white/20" />
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[15px] font-semibold">{profile.name}</h1>
                        <p className="truncate text-xs text-slate-300">{profile.members[0]?.name ?? ""}</p>
                    </div>
                    <button type="button" onClick={toggle} disabled={saving}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${status === "OPEN" ? "border-success/40 bg-success/15 text-success hover:bg-success/25" : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/15"}`}>
                        <Icon icon={status === "OPEN" ? "solar:chat-round-check-linear" : "solar:lock-keyhole-minimalistic-linear"} className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">{status === "OPEN" ? "ღია · დახურვა" : "დახურული · გახსნა"}</span>
                        <span className="sm:hidden">{status === "OPEN" ? "ღია" : "დახურული"}</span>
                    </button>
                    <button type="button" onClick={() => setInfoOpen(true)} aria-label="ბიზნესის ინფორმაცია" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white xl:hidden">
                        <Icon icon="solar:info-circle-linear" className="h-5 w-5" aria-hidden="true" />
                    </button>
                </>}
            />
        </div>

        <aside className="hidden min-h-0 overflow-y-auto xl:block"><BusinessPanel profile={profile} /></aside>

        <div className={`fixed inset-0 z-50 xl:hidden ${infoOpen ? "pointer-events-auto" : "pointer-events-none"}`} inert={!infoOpen} role="dialog" aria-modal="true" aria-label="ბიზნესის ინფორმაცია">
            <button type="button" aria-label="დახურვა" onClick={() => setInfoOpen(false)} className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${infoOpen ? "opacity-100" : "opacity-0"}`} />
            <div className={`absolute inset-y-0 right-0 w-[min(360px,92vw)] overflow-y-auto bg-background p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl transition-transform duration-300 ease-out ${infoOpen ? "translate-x-0" : "translate-x-full"}`}>
                <div className="mb-2 flex justify-end">
                    <button type="button" onClick={() => setInfoOpen(false)} aria-label="დახურვა" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-surface">
                        <Icon icon="solar:close-circle-linear" className="h-6 w-6" aria-hidden="true" />
                    </button>
                </div>
                <BusinessPanel profile={profile} />
            </div>
        </div>
    </div>;
}
