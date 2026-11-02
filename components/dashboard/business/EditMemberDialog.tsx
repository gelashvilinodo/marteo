"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import { hasBusinessFeature, type BusinessMode } from "@/lib/business/business-mode";
import type { BusinessPermission } from "@/lib/business/permissions";
import { PERMISSION_OPTIONS, type TeamMember, type TeamSnapshot } from "@/lib/business/team";
import PermissionPicker from "./PermissionPicker";

export default function EditMemberDialog({ member, businessMode, onClose, onSaved }: {
    member: TeamMember;
    businessMode: BusinessMode;
    onClose: () => void;
    onSaved: (team: TeamSnapshot, message: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [permissions, setPermissions] = useState<BusinessPermission[]>(member.permissions);
    const [readOnly, setReadOnly] = useState(member.readOnly);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const options = PERMISSION_OPTIONS.filter(option => option.value !== "PRODUCTION" || hasBusinessFeature(businessMode, "manufacturing"));

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        return () => element?.close();
    }, []);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (busy) return;
        if (!permissions.length) {
            setError("მონიშნე ერთი უფლება მაინც.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/business/members/${encodeURIComponent(member.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions, readOnly }),
            });
            const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string; team?: TeamSnapshot };
            if (!response.ok || !data.success || !data.team) {
                setError(data.message || "უფლებები ვერ შეინახა. სცადე ხელახლა.");
                return;
            }
            onSaved(data.team, data.message || "უფლებები განახლდა.");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადე ხელახლა.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog ref={dialog} aria-labelledby={titleId} aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
            <form onSubmit={submit} noValidate className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <h2 id={titleId} className="flex min-w-0 items-center gap-2 font-semibold">
                        <Icon icon="solar:shield-user-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        <span className="truncate">{member.name}: უფლებები</span>
                    </h2>
                    <button type="button" disabled={busy} onClick={onClose} aria-label="ფანჯრის დახურვა"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border disabled:opacity-50">
                        <Icon icon="solar:close-circle-linear" className="size-5" aria-hidden="true" />
                    </button>
                </div>
                <PermissionPicker options={options} permissions={permissions} readOnly={readOnly} disabled={busy}
                    onToggle={permission => { setError(""); setPermissions(current => current.includes(permission) ? current.filter(item => item !== permission) : [...current, permission]); }}
                    onReadOnly={() => setReadOnly(value => !value)} />
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} disabled={busy}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">
                        გაუქმება
                    </button>
                    <button type="submit" disabled={busy}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50">
                        {busy && <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />}
                        შენახვა
                    </button>
                </div>
            </form>
        </dialog>
    );
}
