import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getAdminBusinessDetail } from "@/lib/admin/details";
import { BUSINESS_MODES } from "@/lib/business/business-mode";
import { formatSupportCount, formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import SupportAvatar from "@/components/support/SupportAvatar";
import OpenSupportChatButton from "@/components/admin/OpenSupportChatButton";
import { BackLink, InfoRow, Panel, Stat } from "@/components/admin/AdminDetail";
import { ROLE_LABELS, SUBSCRIPTION_STATUS_LABELS as SUBSCRIPTION_STATUS, UserStatusBadge } from "@/components/admin/AdminBadges";
import SubscriptionEditor from "@/components/admin/SubscriptionEditor";
import AuditHistory from "@/components/admin/AuditHistory";
import { getAuditLog } from "@/lib/admin/actions";
import { createPrismaClient } from "@/lib/prisma";

export const metadata = { title: "ბიზნესი · ადმინ პანელი" };



function when(date: Date | null, empty = "ჯერ არ არის") {
    if (!date) return empty;
    const iso = date.toISOString();
    return `${formatSupportDate(iso)}, ${formatSupportTime(iso)}`;
}

export default async function AdminBusinessPage({ params }: { params: Promise<{ businessId: string }> }) {
    const { businessId } = await params;
    const business = await getAdminBusinessDetail(businessId).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    if (!business) notFound();
    const prisma = createPrismaClient();
    const history = await getAuditLog(prisma, "BUSINESS", business.id).finally(() => prisma.$disconnect());
    const mode = BUSINESS_MODES.find(item => item.value === business.mode);
    const website = business.website ? (/^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`) : null;

    return <div className="mx-auto max-w-5xl">
        <BackLink href="/admin/businesses" label="ბიზნესები" />

        <header className="mt-3 flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
            <SupportAvatar name={business.name} imageUrl={business.logoUrl} size="lg" />
            <div className="min-w-0 flex-1">
                <h1 className="break-words text-xl font-semibold text-text-primary sm:text-2xl">{business.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                    <span className="flex items-center gap-1">{mode && <Icon icon={mode.icon} className="h-4 w-4" aria-hidden="true" />}{mode?.label ?? business.mode}</span>
                    <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">{business.plan ?? "პაკეტის გარეშე"}{business.subscriptionStatus ? ` · ${SUBSCRIPTION_STATUS[business.subscriptionStatus] ?? business.subscriptionStatus}` : ""}</span>
                    <span>შეიქმნა {formatSupportDate(business.createdAt.toISOString())}</span>
                </p>
            </div>
            <OpenSupportChatButton businessId={business.id} conversationId={business.conversationId} />
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat icon="solar:cart-large-2-bold-duotone" label="შეკვეთა სულ" value={formatSupportCount(business.orders)} tone="bg-success/12 text-success" />
            <Stat icon="solar:graph-up-bold-duotone" label="შეკვეთა ბოლო 30 დღეში" value={formatSupportCount(business.ordersLast30)} tone="bg-accent/12 text-accent" />
            <Stat icon="solar:users-group-rounded-bold-duotone" label="კლიენტი" value={formatSupportCount(business.customers)} tone="bg-violet-500/12 text-violet-500" />
            <Stat icon="solar:box-bold-duotone" label="პროდუქტი" value={formatSupportCount(business.products)} tone="bg-amber-500/12 text-amber-500" />
            <Stat icon="solar:printer-bold-duotone" label="დაბეჭდილი ინვოისი" value={formatSupportCount(business.invoices)} tone="bg-sky-500/12 text-sky-500" />
        </div>

        <div className="mt-4">
            <Panel title="პაკეტი" action={business.subscriptionStartedAt ? <span className="text-xs text-text-secondary">დაიწყო {formatSupportDate(business.subscriptionStartedAt.toISOString())}</span> : undefined}>
                <SubscriptionEditor businessId={business.id} current={{ plan: business.plan, status: business.subscriptionStatus, expiresAt: business.subscriptionExpiresAt?.toISOString() ?? null }} />
            </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col gap-4">
                <Panel title="აქტივობა">
                    <InfoRow icon="solar:login-3-linear" label="ბოლო შესვლა (ნებისმიერი წევრი)">{when(business.lastLoginAt)}</InfoRow>
                    <InfoRow icon="solar:cart-large-2-linear" label="ბოლო შეკვეთა">{when(business.lastOrderAt)}</InfoRow>
                    <InfoRow icon="solar:chat-round-dots-linear" label="მხარდაჭერის ჩათი">
                        {business.conversationId
                            ? `${business.conversationStatus === "OPEN" ? "ღია" : "დახურული"} · ბოლო მიწერა ${when(business.lastSupportMessageAt)}`
                            : "მიმოწერა არ ყოფილა"}
                    </InfoRow>
                </Panel>
                <Panel title="კონტაქტი">
                    {business.phone && <InfoRow icon="solar:phone-linear" label="ტელეფონი" href={`tel:${business.phone}`}>{business.phone}</InfoRow>}
                    {business.email && <InfoRow icon="solar:letter-linear" label="ელფოსტა" href={`mailto:${business.email}`}>{business.email}</InfoRow>}
                    {website && <InfoRow icon="solar:global-linear" label="ვებსაიტი" href={website}>{business.website}</InfoRow>}
                    {business.address && <InfoRow icon="solar:map-point-linear" label="მისამართი">{business.address}</InfoRow>}
                    {business.description && <InfoRow icon="solar:document-text-linear" label="აღწერა">{business.description}</InfoRow>}
                    {!business.phone && !business.email && !website && !business.address && !business.description && <p className="text-sm text-text-secondary">საკონტაქტო ინფორმაცია არ არის შევსებული.</p>}
                </Panel>
            </div>

            <Panel title={`გუნდი · ${business.members.length}`}>
                <ul className="flex flex-col divide-y divide-border">
                    {business.members.map(member => {
                        const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
                        return <li key={member.userId}>
                            <Link href={`/admin/users/${member.userId}`} prefetch={false} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-background">
                                <SupportAvatar name={name} imageUrl={member.avatarUrl} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-1.5">
                                        <span className="truncate text-sm font-medium text-text-primary">{name}</span>
                                        <span className="rounded-full bg-background px-1.5 text-[10px] text-text-secondary">{ROLE_LABELS[member.role] ?? member.role}</span>
                                        <UserStatusBadge status={member.status} />
                                    </p>
                                    <p className="truncate text-xs text-text-secondary">{member.email} · {member.phone}</p>
                                    <p className="mt-0.5 text-[11px] text-text-secondary">ბოლო შესვლა: {when(member.lastLoginAt, "არასდროს")}</p>
                                </div>
                                <Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                            </Link>
                        </li>;
                    })}
                    {!business.members.length && <li className="py-3 text-sm text-text-secondary">წევრები არ ჰყავს.</li>}
                </ul>
            </Panel>
        </div>
        <div className="mt-4">
            <Panel title="ცვლილებების ისტორია"><AuditHistory entries={history} /></Panel>
        </div>
        <p className="mt-4 text-xs leading-5 text-text-secondary">კონფიდენციალურობის დაპირების გამო აქ მხოლოდ რაოდენობები ჩანს: შეკვეთების, კლიენტებისა და ფინანსების შიგთავსი ადმინ პანელში არ ჩანს.</p>
    </div>;
}
