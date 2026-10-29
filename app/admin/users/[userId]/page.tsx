import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getAdminUserDetail } from "@/lib/admin/details";
import { BUSINESS_MODES } from "@/lib/business/business-mode";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import SupportAvatar from "@/components/support/SupportAvatar";
import { BackLink, InfoRow, Panel } from "@/components/admin/AdminDetail";
import { ROLE_LABELS, UserStatusBadge } from "@/components/admin/AdminBadges";
import UserActions from "@/components/admin/UserActions";
import AuditHistory from "@/components/admin/AuditHistory";
import { getAuditLog } from "@/lib/admin/actions";
import { createPrismaClient } from "@/lib/prisma";

export const metadata = { title: "მომხმარებელი · ადმინ პანელი" };

function when(date: Date | null, empty: string) {
    if (!date) return empty;
    const iso = date.toISOString();
    return `${formatSupportDate(iso)}, ${formatSupportTime(iso)}`;
}

function Verified({ at }: { at: Date | null }) {
    return <span className={`inline-flex items-center gap-1 ${at ? "text-success" : "text-danger"}`}>
        <Icon icon={at ? "solar:check-circle-bold" : "solar:close-circle-bold"} className="h-4 w-4" aria-hidden="true" />
        {at ? `დადასტურდა ${formatSupportDate(at.toISOString())}` : "არ არის დადასტურებული"}
    </span>;
}

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
    const { userId } = await params;
    const user = await getAdminUserDetail(userId).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    if (!user) notFound();
    const prisma = createPrismaClient();
    const history = await getAuditLog(prisma, "USER", user.id).finally(() => prisma.$disconnect());
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "უსახელო";

    return <div className="mx-auto max-w-4xl">
        <BackLink href="/admin/users" label="მომხმარებლები" />

        <header className="mt-3 flex items-center gap-4 rounded-3xl border border-border bg-surface p-5">
            <SupportAvatar name={name} imageUrl={user.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-text-primary sm:text-2xl">
                    <span className="break-words">{name}</span>
                    <UserStatusBadge status={user.status} />
                    {user.isPlatformAdmin && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">პლატფორმის ადმინი</span>}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">დარეგისტრირდა {formatSupportDate(user.createdAt.toISOString())}</p>
            </div>
        </header>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Panel title="კონტაქტი და დადასტურება">
                <InfoRow icon="solar:letter-linear" label="ელფოსტა" href={`mailto:${user.email}`}>{user.email}</InfoRow>
                <InfoRow icon="solar:shield-check-linear" label="ელფოსტის დადასტურება"><Verified at={user.emailVerifiedAt} /></InfoRow>
                <InfoRow icon="solar:phone-linear" label="ტელეფონი" href={`tel:${user.phone}`}>{user.phone}</InfoRow>
                <InfoRow icon="solar:shield-check-linear" label="ტელეფონის დადასტურება"><Verified at={user.phoneVerifiedAt} /></InfoRow>
            </Panel>
            <Panel title="აქტივობა">
                <InfoRow icon="solar:login-3-linear" label="ბოლო შესვლა">{when(user.lastLoginAt, "არასდროს")}</InfoRow>
                <InfoRow icon="solar:devices-linear" label="აქტიური სესიები (მოწყობილობები)">{user.activeSessions}</InfoRow>
                <InfoRow icon="solar:calendar-linear" label="რეგისტრაცია">{when(user.createdAt, "-")}</InfoRow>
            </Panel>
        </div>

        <div className="mt-4">
            <Panel title="მოქმედებები">
                <UserActions userId={user.id} email={user.email} phone={user.phone} status={user.status}
                    emailVerified={Boolean(user.emailVerifiedAt)} phoneVerified={Boolean(user.phoneVerifiedAt)}
                    activeSessions={user.activeSessions} protectedAccount={user.isPlatformAdmin} />
            </Panel>
        </div>

        <div className="mt-4">
            <Panel title={`ბიზნესები · ${user.businesses.length}`}>
                <ul className="flex flex-col divide-y divide-border">
                    {user.businesses.map(business => {
                        const mode = BUSINESS_MODES.find(item => item.value === business.mode);
                        return <li key={business.id}>
                            <Link href={`/admin/businesses/${business.id}`} prefetch={false} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-background">
                                <SupportAvatar name={business.name} imageUrl={business.logoUrl} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-text-primary">{business.name}</p>
                                    <p className="truncate text-xs text-text-secondary">{ROLE_LABELS[business.role] ?? business.role} · {mode?.label ?? business.mode} · {business.plan ?? "პაკეტის გარეშე"}</p>
                                </div>
                                <Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                            </Link>
                        </li>;
                    })}
                    {!user.businesses.length && <li className="py-3 text-sm text-text-secondary">ბიზნესი ჯერ არ შეუქმნია.</li>}
                </ul>
            </Panel>
        </div>
        <div className="mt-4">
            <Panel title="ცვლილებების ისტორია"><AuditHistory entries={history} /></Panel>
        </div>
    </div>;
}
