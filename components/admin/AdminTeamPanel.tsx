"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel } from "./AdminDetail";
import ConfirmDialog from "./ConfirmDialog";
import AdminCodeField from "./AdminCodeField";
import AdminInviteDialog from "./AdminInviteDialog";
import { formatTbilisiDateTime } from "@/lib/tbilisi-date-time";

type Member = { id: string; name: string; email: string; isOwner: boolean; twoFactor: boolean; joinedAt: string | null; invitedBy: string | null };
type Invite = { id: string; email: string; createdAt: string; expiresAt: string; expired: boolean; invitedBy: string | null };

export default function AdminTeamPanel({ isOwner, currentId, members, pending }: { isOwner: boolean; currentId: string; members: Member[]; pending: Invite[] }) {
    const router = useRouter();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [removing, setRemoving] = useState<Member | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [listError, setListError] = useState("");

    const remove = async () => {
        if (!removing) return;
        if (!code) { setError("შეიყვანე კოდი აპიდან."); return; }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/team/members/${removing.id}/remove`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "ვერ მოიხსნა.");
            setRemoving(null);
            router.refresh();
        } catch (cause) {
            setCode("");
            setError(cause instanceof Error ? cause.message : "ვერ მოიხსნა.");
        } finally { setBusy(false); }
    };

    const cancel = async (id: string) => {
        setCancelingId(id);
        setListError("");
        try {
            const response = await fetch(`/api/admin/team/invites/${id}/cancel`, { method: "POST" });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "ვერ გაუქმდა.");
            router.refresh();
        } catch (cause) {
            setListError(cause instanceof Error ? cause.message : "ვერ გაუქმდა.");
        } finally { setCancelingId(null); }
    };

    const inviteButton = isOwner && <button type="button" onClick={() => setInviteOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent-hover">
        <Icon icon="solar:user-plus-linear" className="h-4 w-4" aria-hidden="true" />ადმინის დამატება
    </button>;

    return <div className="flex flex-col gap-4">
        <Panel title="ადმინები" action={inviteButton || undefined}>
            <ul className="divide-y divide-border">
                {members.map(member => <li key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                        <Icon icon={member.isOwner ? "solar:crown-minimalistic-bold-duotone" : "solar:shield-user-bold-duotone"} className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text-primary">
                            <span className="truncate">{member.name}</span>
                            {member.id === currentId && <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-text-secondary">შენ</span>}
                            {member.isOwner && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] text-accent">მფლობელი</span>}
                            {!member.twoFactor && <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] text-amber-600">2FA ჯერ არ ჩართულა</span>}
                        </p>
                        <p className="truncate text-xs text-text-secondary">{member.email}</p>
                        {member.joinedAt && <p className="text-xs text-text-secondary">დაემატა {formatTbilisiDateTime(member.joinedAt)}{member.invitedBy ? ` · მოიწვია ${member.invitedBy}` : ""}</p>}
                    </div>
                    {isOwner && !member.isOwner && member.id !== currentId && <button type="button"
                        onClick={() => { setCode(""); setError(""); setRemoving(member); }}
                        className="h-9 rounded-xl border border-danger/30 px-3 text-sm font-medium text-danger transition hover:bg-danger/10">მოხსნა</button>}
                </li>)}
            </ul>
        </Panel>

        <Panel title="მოწვევები">
            {pending.length === 0 ? <p className="text-sm text-text-secondary">გაგზავნილი მოწვევა არ არის.</p> :
                <ul className="divide-y divide-border">
                    {pending.map(invite => <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <Icon icon="solar:letter-linear" className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text-primary">{invite.email}</p>
                            <p className="text-xs text-text-secondary">
                                გაიგზავნა {formatTbilisiDateTime(invite.createdAt)}{invite.invitedBy ? ` · ${invite.invitedBy}` : ""} · {invite.expired
                                    ? <span className="text-danger">ვადა გაუვიდა</span>
                                    : `მოქმედებს ${formatTbilisiDateTime(invite.expiresAt)}-მდე`}
                            </p>
                        </div>
                        {isOwner && <button type="button" disabled={cancelingId !== null} onClick={() => void cancel(invite.id)}
                            className="h-9 rounded-xl border border-border px-3 text-sm font-medium text-text-primary transition hover:bg-background disabled:opacity-60">
                            {cancelingId === invite.id ? "…" : "გაუქმება"}
                        </button>}
                    </li>)}
                </ul>}
            {listError && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{listError}</p>}
        </Panel>

        {isOwner && <AdminInviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />}
        <ConfirmDialog open={removing !== null} danger title="ადმინის მოხსნა" confirmLabel="მოხსნა" cancelLabel="დატოვება" busy={busy} error={error}
            onConfirm={() => void remove()} onClose={() => { if (!busy) setRemoving(null); }}>
            <span className="block"><b className="font-medium text-text-primary">{removing?.name}</b> ({removing?.email}) ადმინ პანელში ვეღარ შევა. ანგარიში და ბიზნესები უცვლელი რჩება, მისი სანდო მოწყობილობები და 2FA წაიშლება.</span>
            <AdminCodeField value={code} onChange={setCode} />
        </ConfirmDialog>
    </div>;
}
