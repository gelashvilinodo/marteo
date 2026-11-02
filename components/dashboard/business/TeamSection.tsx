"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import SuccessToast from "@/components/shared/SuccessToast";
import type { BusinessMode } from "@/lib/business/business-mode";
import type { BusinessPermission } from "@/lib/business/permissions";
import { PERMISSION_OPTIONS, type TeamInvite, type TeamMember, type TeamSnapshot } from "@/lib/business/team";
import InviteMemberDialog from "./InviteMemberDialog";

type ApiResponse = { success?: boolean; message?: string; team?: TeamSnapshot };

const permissionLabel = (permission: BusinessPermission) =>
    PERMISSION_OPTIONS.find(option => option.value === permission)?.label ?? permission;

function Chips({ permissions, readOnly }: { permissions: BusinessPermission[]; readOnly: boolean }) {
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {permissions.map(permission => (
                <span key={permission} className="rounded-lg bg-background px-2 py-0.5 text-xs text-text-secondary">
                    {permissionLabel(permission)}
                </span>
            ))}
            {readOnly && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-background px-2 py-0.5 text-xs text-text-secondary">
                    <Icon icon="solar:eye-linear" className="size-3.5" aria-hidden="true" />
                    მხოლოდ ნახვა
                </span>
            )}
        </div>
    );
}

function RoleBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warning" }) {
    const tones = { neutral: "bg-background text-text-secondary", accent: "bg-accent/15 text-accent", warning: "bg-warning/15 text-warning" };
    return <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export default function TeamSection({ initialTeam, businessMode }: { initialTeam: TeamSnapshot; businessMode: BusinessMode }) {
    const [team, setTeam] = useState(initialTeam);
    const [inviting, setInviting] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [confirmCancel, setConfirmCancel] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [now, setNow] = useState(0);

    // დრო მხოლოდ ბრაუზერში ითვლება, რომ სერვერის რენდერს არ ასცდეს.
    useEffect(() => {
        const first = window.setTimeout(() => setNow(Date.now()), 0);
        const timer = window.setInterval(() => setNow(Date.now()), 15000);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, []);

    const closeDialog = useCallback(() => setInviting(false), []);
    const founderId = team.members.find(member => member.role === "OWNER")?.id;
    const canInvite = team.used.coOwners < team.limits.coOwners || team.used.staff < team.limits.staff;

    async function act(invite: TeamInvite, action: "resend" | "cancel") {
        if (busyId) return;
        setBusyId(invite.id);
        setError("");
        try {
            const response = await fetch(
                `/api/business/members/invites/${encodeURIComponent(invite.id)}${action === "resend" ? "/resend" : ""}`,
                { method: action === "resend" ? "POST" : "DELETE" },
            );
            const data = (await response.json().catch(() => ({}))) as ApiResponse;
            if (!response.ok || !data.success || !data.team) {
                setError(data.message || "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.");
                return;
            }
            setTeam(data.team);
            setNotice(data.message ?? "");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადე ხელახლა.");
        } finally {
            setBusyId("");
            setConfirmCancel("");
        }
    }

    function memberRow(member: TeamMember) {
        const isFounder = member.id === founderId;
        return (
            <li key={member.id} className="flex min-w-0 items-start gap-3 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                    {member.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate font-medium text-text-primary">{member.name}</span>
                        {member.isYou && <span className="text-xs text-text-secondary">(შენ)</span>}
                        {member.role === "OWNER"
                            ? <RoleBadge tone="accent">{isFounder ? "მფლობელი" : "თანამფლობელი"}</RoleBadge>
                            : <RoleBadge>თანამშრომელი</RoleBadge>}
                        {member.status === "FROZEN" && <RoleBadge tone="warning">გაყინული</RoleBadge>}
                    </div>
                    <p className="truncate text-sm text-text-secondary">{member.email}</p>
                    {member.role === "MEMBER" && <Chips permissions={member.permissions} readOnly={member.readOnly} />}
                </div>
            </li>
        );
    }

    function inviteRow(invite: TeamInvite) {
        const expired = invite.expired || (now > 0 && Date.parse(invite.expiresAt) <= now);
        const waitSeconds = now ? Math.max(0, Math.ceil((Date.parse(invite.resendAvailableAt) - now) / 1000)) : 0;
        const hoursLeft = now ? Math.max(0, Math.ceil((Date.parse(invite.expiresAt) - now) / 3600_000)) : 0;
        const busy = busyId === invite.id;
        return (
            <li key={invite.id} className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-text-secondary">
                        <Icon icon="solar:letter-linear" className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 break-all font-medium text-text-primary">{invite.email}</span>
                            <RoleBadge tone={invite.role === "OWNER" ? "accent" : "neutral"}>
                                {invite.role === "OWNER" ? "თანამფლობელი" : "თანამშრომელი"}
                            </RoleBadge>
                        </div>
                        <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${expired ? "text-danger" : "text-warning"}`}>
                            <Icon icon={expired ? "solar:clock-circle-linear" : "solar:hourglass-linear"} className="size-4 shrink-0" aria-hidden="true" />
                            {expired ? "ბმულს ვადა გაუვიდა" : "ველოდებით დადასტურებას"}
                            {!expired && now > 0 && <span className="text-text-secondary">· ბმული მოქმედებს {hoursLeft} სთ</span>}
                        </p>
                        {invite.role === "MEMBER" && <Chips permissions={invite.permissions} readOnly={invite.readOnly} />}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 pl-13 sm:pl-0">
                    {confirmCancel === invite.id ? (
                        <>
                            <button type="button" disabled={busy} onClick={() => act(invite, "cancel")}
                                className="inline-flex min-h-9 items-center rounded-xl bg-danger px-3 text-sm font-medium text-white disabled:opacity-50">
                                {busy ? "უქმდება…" : "დიახ, გააუქმე"}
                            </button>
                            <button type="button" disabled={busy} onClick={() => setConfirmCancel("")}
                                className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm disabled:opacity-50">
                                არა
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" disabled={Boolean(busyId) || invite.resendsLeft === 0 || waitSeconds > 0}
                                onClick={() => act(invite, "resend")}
                                title={invite.resendsLeft === 0 ? "ხელახლა გაგზავნის ლიმიტი ამოიწურა" : undefined}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50">
                                <Icon icon={busy ? "solar:refresh-linear" : "solar:restart-linear"} className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
                                {waitSeconds > 0 && invite.resendsLeft > 0
                                    ? `ხელახლა ${Math.ceil(waitSeconds / 60)} წთ-ში`
                                    : `ხელახლა გაგზავნა (${invite.resendsLeft})`}
                            </button>
                            <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmCancel(invite.id)}
                                className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
                                გაუქმება
                            </button>
                        </>
                    )}
                </div>
            </li>
        );
    }

    return (
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                        <Icon icon="solar:users-group-rounded-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        გუნდი
                    </h2>
                    <p className="mt-2 text-sm text-text-secondary">
                        თანამფლობელები {team.used.coOwners}/{team.limits.coOwners} · თანამშრომლები {team.used.staff}/{team.limits.staff}
                    </p>
                </div>
                <button type="button" onClick={() => setInviting(true)} disabled={!canInvite}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50">
                    <Icon icon="solar:user-plus-linear" className="size-5" aria-hidden="true" />
                    წევრის დამატება
                </button>
            </div>

            {!canInvite && (
                <p className="mt-3 rounded-xl bg-background p-3 text-sm text-text-secondary">
                    {team.limits.coOwners + team.limits.staff === 0
                        ? "გუნდის დასამატებლად გეგმის გაუმჯობესებაა საჭირო."
                        : "შენი გეგმის ლიმიტი შევსებულია. მეტი წევრისთვის გეგმა გააუმჯობესე."}
                </p>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

            <ul className="mt-3 divide-y divide-border">
                {team.members.map(memberRow)}
                {team.invites.map(inviteRow)}
            </ul>

            {inviting && (
                <InviteMemberDialog team={team} businessMode={businessMode} onClose={closeDialog}
                    onInvited={updated => setTeam(updated)} />
            )}
            <SuccessToast message={notice} clear={setNotice} />
        </section>
    );
}
