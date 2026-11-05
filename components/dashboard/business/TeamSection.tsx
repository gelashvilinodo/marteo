"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import SuccessToast from "@/components/shared/SuccessToast";
import type { BusinessMode } from "@/lib/business/business-mode";
import type { BusinessPermission } from "@/lib/business/permissions";
import { PERMISSION_OPTIONS, planPermissions, TEAM_LIMITS, type TeamInvite, type TeamMember, type TeamRequestView, type TeamSnapshot } from "@/lib/business/team";
import { PLAN_ADJECTIVES } from "@/lib/subscription/plans";
import InviteMemberDialog from "./InviteMemberDialog";
import EditMemberDialog from "./EditMemberDialog";
import { usePlan } from "@/components/dashboard/plan/PlanContext";
import { CornerCrown } from "@/components/dashboard/plan/PlanCrown";

type ApiResponse = { success?: boolean; message?: string; team?: TeamSnapshot };

const permissionLabel = (permission: BusinessPermission) =>
    PERMISSION_OPTIONS.find(option => option.value === permission)?.label ?? permission;

// გეგმაში არშემავალი უფლებები (მაგ. სტარტზე მარაგი) არ ჩანს; თუ სხვა არაფერი რჩება, მფლობელი გაფრთხილებულია.
function Chips({ permissions, readOnly, allowed }: { permissions: BusinessPermission[]; readOnly: boolean; allowed: BusinessPermission[] }) {
    const visible = permissions.filter(permission => allowed.includes(permission));
    if (!visible.length) {
        return <p className="mt-2 text-xs text-warning">თქვენს გეგმაზე ამ წევრს მონიშნული უფლება არ აქვს. მიანიჭეთ ახალი უფლება.</p>;
    }
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {visible.map(permission => (
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
    const { allows, guard, openUpgrade } = usePlan();
    const [busyId, setBusyId] = useState("");
    const [confirmCancel, setConfirmCancel] = useState("");
    const [confirmRemove, setConfirmRemove] = useState("");
    const [editing, setEditing] = useState<TeamMember | null>(null);
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
    const founderId = team.members.find(member => member.isFounder)?.id;
    const activeOwners = team.members.filter(member => member.role === "OWNER" && member.status === "ACTIVE").length;

    // გუნდის მოქმედებები ერთ ადგილას: პასუხად ყოველთვის განახლებული გუნდი მოდის.
    async function send(id: string, url: string, method: string, body?: unknown) {
        if (busyId) return null;
        setBusyId(id);
        setError("");
        try {
            const response = await fetch(url, {
                method,
                headers: body === undefined ? undefined : { "Content-Type": "application/json" },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const data = (await response.json().catch(() => ({}))) as ApiResponse & { redirectTo?: string };
            if (!response.ok || !data.success) {
                setError(data.message || "მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.");
                return null;
            }
            if (data.team) setTeam(data.team);
            setNotice(data.message ?? "");
            return data;
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა.");
            return null;
        } finally {
            setBusyId("");
            setConfirmRemove("");
        }
    }

    async function leave(member: TeamMember) {
        if (!window.confirm("ნამდვილად ტოვებთ ამ ბიზნესს? დაბრუნება მხოლოდ ახალი მოწვევით შეიძლება.")) return;
        const data = await send(member.id, "/api/business/members/leave", "POST");
        if (data) window.location.assign(data.redirectTo || "/dashboard");
    }

    function requestRow(request: TeamRequestView) {
        const busy = busyId === request.id;
        const what = request.kind === "DELETE_BUSINESS" ? "ბიზნესის წაშლა" : `გუნდიდან გაშვება: ${request.targetName ?? "წევრი"}`;
        return (
            <li key={request.id} className={`rounded-xl border p-3 text-sm ${request.kind === "DELETE_BUSINESS" ? "border-red-600/40 bg-red-600/5" : "border-warning/40 bg-warning/10"}`}>
                <p className="font-medium text-text-primary">
                    {request.requestedByYou ? "თქვენ ითხოვეთ" : `${request.requestedByName} ითხოვს`}: {what}
                </p>
                <p className="mt-1 text-text-secondary">ელოდება თანხმობას: {request.waitingFor.join(", ") || "-"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {!request.youApproved && (
                        <>
                            <button type="button" disabled={Boolean(busyId)}
                                onClick={() => send(request.id, `/api/business/requests/${encodeURIComponent(request.id)}/vote`, "POST", { approve: true })
                                    .then(data => { if ((data as { deleted?: boolean } | null)?.deleted) window.location.assign("/dashboard"); })}
                                className={`inline-flex min-h-9 items-center rounded-xl border px-3 text-sm font-medium disabled:opacity-50 ${request.kind === "DELETE_BUSINESS" ? "delete-button" : "border-success bg-success text-white"}`}>
                                {busy ? "იგზავნება…" : "ვეთანხმები"}
                            </button>
                            <button type="button" disabled={Boolean(busyId)}
                                onClick={() => send(request.id, `/api/business/requests/${encodeURIComponent(request.id)}/vote`, "POST", { approve: false })}
                                className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm disabled:opacity-50">
                                არ ვეთანხმები
                            </button>
                        </>
                    )}
                    {request.requestedByYou && (
                        <button type="button" disabled={Boolean(busyId)}
                            onClick={() => send(request.id, `/api/business/requests/${encodeURIComponent(request.id)}`, "DELETE")}
                            className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm disabled:opacity-50">
                            მოთხოვნის გაუქმება
                        </button>
                    )}
                </div>
            </li>
        );
    }
    const teamAllowed = allows("team");
    const canInvite = teamAllowed && (team.used.coOwners < team.limits.coOwners || team.used.staff < team.limits.staff);
    const allowedPermissions = planPermissions(team.plan);
    // ლიმიტი შევსებულია: სტარტიდან ბიზნესზე, ბიზნესიდან PRO-ზე.
    const nextTier = team.plan === "START" ? "BUSINESS" : "PRO";
    const nextLimits = TEAM_LIMITS[nextTier];

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
                setError(data.message || "მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.");
                return;
            }
            setTeam(data.team);
            setNotice(data.message ?? "");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა.");
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
                        {member.isYou && <span className="text-xs text-text-secondary">(თქვენ)</span>}
                        {member.role === "OWNER"
                            ? <RoleBadge tone="accent">{isFounder ? "მფლობელი" : "თანამფლობელი"}</RoleBadge>
                            : <RoleBadge>თანამშრომელი</RoleBadge>}
                        {member.status === "FROZEN" && <RoleBadge tone="warning">გაყინული</RoleBadge>}
                    </div>
                    <p className="truncate text-sm text-text-secondary">{member.email}</p>
                    {member.role === "MEMBER" && <Chips permissions={member.permissions} readOnly={member.readOnly} allowed={allowedPermissions} />}
                    {member.role !== "OWNER" && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {confirmRemove === member.id ? (
                                <>
                                    <span className="w-full text-xs text-text-secondary">
                                        {activeOwners > 1 ? "გაშვებას დანარჩენი მფლობელების თანხმობაც დასჭირდება." : "წევრი მაშინვე დაკარგავს წვდომას."}
                                    </span>
                                    <button type="button" disabled={Boolean(busyId)}
                                        onClick={() => send(member.id, `/api/business/members/${encodeURIComponent(member.id)}/remove`, "POST")}
                                        className="inline-flex min-h-9 items-center rounded-xl bg-danger px-3 text-sm font-medium text-white disabled:opacity-50">
                                        {busyId === member.id ? "იგზავნება…" : "დიახ, გაუშვით"}
                                    </button>
                                    <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmRemove("")}
                                        className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm disabled:opacity-50">
                                        არა
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type="button" disabled={Boolean(busyId)} onClick={() => setEditing(member)}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50">
                                        <Icon icon="solar:pen-linear" className="size-4" aria-hidden="true" />
                                        უფლებები
                                    </button>
                                    <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmRemove(member.id)}
                                        className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
                                        გუნდიდან გაშვება
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    {member.isYou && member.role === "OWNER" && activeOwners > 1 && (
                        <button type="button" disabled={Boolean(busyId)} onClick={() => leave(member)}
                            className="mt-2 inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
                            ბიზნესის დატოვება
                        </button>
                    )}
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
                        <p className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm ${expired ? "text-danger" : "text-warning"}`}>
                            <Icon icon={expired ? "solar:clock-circle-linear" : "solar:hourglass-linear"} className="size-4 shrink-0" aria-hidden="true" />
                            {expired ? "ბმულს ვადა გაუვიდა" : "ველოდებით დადასტურებას"}
                            {!expired && now > 0 && <span className="text-text-secondary">· ბმული მოქმედებს {hoursLeft} სთ</span>}
                        </p>
                        {invite.role === "MEMBER" && <Chips permissions={invite.permissions} readOnly={invite.readOnly} allowed={allowedPermissions} />}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 pl-13 sm:pl-0">
                    {confirmCancel === invite.id ? (
                        <>
                            <button type="button" disabled={busy} onClick={() => act(invite, "cancel")}
                                className="inline-flex min-h-9 items-center rounded-xl bg-danger px-3 text-sm font-medium text-white disabled:opacity-50">
                                {busy ? "უქმდება…" : "დიახ, გააუქმეთ"}
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
                {canInvite
                    ? <button type="button" onClick={() => setInviting(true)}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white">
                        <Icon icon="solar:user-plus-linear" className="size-5" aria-hidden="true" />
                        წევრის დამატება
                    </button>
                    // ლიმიტი შევსებულია ან გეგმაში გუნდი არ არის: გვირგვინი აჩვენებს, რომელ გეგმაზე იხსნება.
                    : <button type="button" onClick={() => teamAllowed
                            ? openUpgrade({
                                feature: "team", tier: nextTier,
                                message: `მეტი წევრისთვის საჭიროა ${PLAN_ADJECTIVES[nextTier]} გეგმა: ${nextLimits.coOwners} თანამფლობელი და ${nextLimits.staff} თანამშრომელი.`,
                            })
                            : guard("team")}
                        className="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary">
                        <Icon icon="solar:user-plus-linear" className="size-5" aria-hidden="true" />
                        წევრის დამატება
                        <CornerCrown feature="team" pro={teamAllowed && nextTier === "PRO"} />
                    </button>}
            </div>

            {!canInvite && (
                <p className="mt-3 rounded-xl bg-background p-3 text-sm text-text-secondary">
                    {team.limits.coOwners + team.limits.staff === 0
                        ? "გუნდის დასამატებლად გეგმის გაუმჯობესებაა საჭირო."
                        : "თქვენი გეგმის ლიმიტი შევსებულია. მეტი წევრისთვის გეგმა გააუმჯობესეთ."}
                </p>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

            {team.requests.length > 0 && <ul className="mt-3 space-y-2">{team.requests.map(requestRow)}</ul>}

            <ul className="mt-3 divide-y divide-border">
                {team.members.map(memberRow)}
                {team.invites.map(inviteRow)}
            </ul>

            {editing && (
                <EditMemberDialog member={editing} plan={team.plan} businessMode={businessMode} onClose={() => setEditing(null)}
                    onSaved={(updated, message) => { setTeam(updated); setNotice(message); setEditing(null); }} />
            )}
            {inviting && (
                <InviteMemberDialog team={team} businessMode={businessMode} onClose={closeDialog}
                    onInvited={updated => setTeam(updated)} />
            )}
            <SuccessToast message={notice} clear={setNotice} />
        </section>
    );
}
