"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import type { BusinessMode } from "@/lib/business/business-mode";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import type { BusinessPermission } from "@/lib/business/permissions";
import { INVITE_LIFETIME_HOURS, PERMISSION_OPTIONS, type TeamSnapshot } from "@/lib/business/team";

type Role = "OWNER" | "MEMBER";
type ApiResponse = { success?: boolean; message?: string; field?: string; team?: TeamSnapshot };

const inputClass =
    "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-accent";

export default function InviteMemberDialog({ team, businessMode, onClose, onInvited }: {
    team: TeamSnapshot;
    businessMode: BusinessMode;
    onClose: () => void;
    onInvited: (team: TeamSnapshot) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const controller = useRef<AbortController | null>(null);
    const running = useRef(false);
    const titleId = useId();

    const ownersFull = team.used.coOwners >= team.limits.coOwners;
    const staffFull = team.used.staff >= team.limits.staff;

    const [role, setRole] = useState<Role | null>(null);
    const [permissions, setPermissions] = useState<BusinessPermission[]>([]);
    const [readOnly, setReadOnly] = useState(false);
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [sentTo, setSentTo] = useState("");

    const options = PERMISSION_OPTIONS.filter(option => option.value !== "PRODUCTION" || hasBusinessFeature(businessMode, "manufacturing"));

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        return () => {
            controller.current?.abort();
            element?.close();
        };
    }, []);

    // წარმატების შემდეგ ფანჯარა თავისით იხურება და სია უკვე განახლებულია.
    useEffect(() => {
        if (!sentTo) return;
        const timer = window.setTimeout(onClose, 1800);
        return () => window.clearTimeout(timer);
    }, [sentTo, onClose]);

    function close() {
        if (running.current) return;
        onClose();
    }

    function toggle(permission: BusinessPermission) {
        setError("");
        setPermissions(current => current.includes(permission)
            ? current.filter(item => item !== permission)
            : [...current, permission]);
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (running.current || !role) return;
        if (role === "MEMBER" && !permissions.length) {
            setError("მონიშნე ერთი უფლება მაინც.");
            return;
        }
        running.current = true;
        setBusy(true);
        setError("");
        controller.current = new AbortController();
        try {
            const response = await fetch("/api/business/members/invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role, permissions, readOnly }),
                signal: controller.current.signal,
            });
            const data = (await response.json().catch(() => ({}))) as ApiResponse;
            if (!response.ok || !data.success || !data.team) {
                setError(data.message || "მოწვევა ვერ გაიგზავნა. სცადე ხელახლა.");
                return;
            }
            onInvited(data.team);
            setSentTo(email.trim().toLowerCase());
        } catch (cause) {
            if ((cause as Error).name !== "AbortError") setError("კავშირი ვერ დამყარდა. სცადე ხელახლა.");
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    const roleCard = (value: Role, title: string, text: string, icon: string, full: boolean, limit: number) => {
        const selected = role === value;
        return (
            <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-accent bg-accent/10" : "border-border hover:bg-background"} ${full ? "cursor-not-allowed opacity-60" : ""}`}>
                <input type="radio" name="role" value={value} checked={selected} disabled={full || busy}
                    onChange={() => { setRole(value); setError(""); }} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                        <Icon icon={icon} className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        {title}
                    </span>
                    <span className="mt-1 block text-sm text-text-secondary">{text}</span>
                    {full && (
                        <span className="mt-1 block text-xs text-warning">
                            {limit ? `ლიმიტი შევსებულია (${limit}). მეტისთვის გეგმა გააუმჯობესე.` : "შენს გეგმაზე ხელმისაწვდომი არ არის."}
                        </span>
                    )}
                </span>
            </label>
        );
    };

    return (
        <dialog
            ref={dialog}
            aria-labelledby={titleId}
            aria-busy={busy}
            onCancel={event => { event.preventDefault(); close(); }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <h2 id={titleId} className="flex min-w-0 items-center gap-2 font-semibold">
                        <Icon icon="solar:user-plus-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        წევრის დამატება
                    </h2>
                    <button type="button" disabled={busy} onClick={close} aria-label="ფანჯრის დახურვა"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border disabled:opacity-50">
                        <Icon icon="solar:close-circle-linear" className="size-5" aria-hidden="true" />
                    </button>
                </div>

                {sentTo ? (
                    <div role="status" className="flex flex-col items-center px-2 py-8 text-center">
                        <Icon icon="solar:check-circle-bold-duotone" className="size-14 text-success" aria-hidden="true" />
                        <p className="mt-3 text-lg font-semibold">მოთხოვნა გაიგზავნა</p>
                        <p className="mt-1 break-all text-sm text-text-secondary">
                            მოწვევა გაეგზავნა {sentTo}-ს. ბმული {INVITE_LIFETIME_HOURS} საათი მოქმედებს.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium text-text-primary">ვის ამატებ?</legend>
                            {roleCard("OWNER", "თანამფლობელი", "მართავს ბიზნესს შენთან ერთად.", "solar:crown-linear", ownersFull, team.limits.coOwners)}
                            {roleCard("MEMBER", "თანამშრომელი", "ხედავს მხოლოდ იმას, რასაც შენ მონიშნავ.", "solar:user-id-linear", staffFull, team.limits.staff)}
                        </fieldset>

                        {role === "OWNER" && (
                            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-text-primary">
                                <p className="flex items-center gap-2 font-medium">
                                    <Icon icon="solar:danger-triangle-linear" className="size-5 shrink-0 text-warning" aria-hidden="true" />
                                    ყურადღება
                                </p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">
                                    <li>თანამფლობელს ექნება ყველაფრის უფლება: შეკვეთები, ფინანსები, პარამეტრები, გუნდი და გეგმა.</li>
                                    <li>ბიზნესის წაშლა და თანამშრომლის გაშვება მხოლოდ ყველა მფლობელის თანხმობით მოხდება.</li>
                                    <li>თანამფლობელს ვერავინ გაუშვებს. ის ბიზნესს მხოლოდ თავისი ნებით დატოვებს.</li>
                                </ul>
                            </div>
                        )}

                        {role === "MEMBER" && (
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium text-text-primary">რაზე ჰქონდეს წვდომა?</legend>
                                <p className="text-sm text-text-secondary">შეგიძლია რამდენიმე მონიშნო.</p>
                                {options.map(option => {
                                    const checked = permissions.includes(option.value);
                                    return (
                                        <label key={option.value} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-accent bg-accent/10" : "border-border hover:bg-background"}`}>
                                            <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(option.value)}
                                                className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-2 font-medium text-text-primary">
                                                    <Icon icon={option.icon} className="size-5 shrink-0 text-accent" aria-hidden="true" />
                                                    {option.label}
                                                </span>
                                                <span className="mt-1 block text-sm text-text-secondary">{option.can}</span>
                                                <span className="block text-sm text-text-secondary">{option.cannot}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                                <label className="mt-3 flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-dashed border-border p-3">
                                    <input type="checkbox" checked={readOnly} disabled={busy} onChange={() => setReadOnly(value => !value)}
                                        className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 font-medium text-text-primary">
                                            <Icon icon="solar:eye-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />
                                            მხოლოდ ნახვა
                                        </span>
                                        <span className="mt-1 block text-sm text-text-secondary">მონიშნულს დაინახავს, მაგრამ ვერაფერს შეცვლის.</span>
                                    </span>
                                </label>
                            </fieldset>
                        )}

                        {role && (
                            <label className="block text-sm font-medium text-text-primary">
                                ელფოსტა
                                <input type="email" name="email" autoComplete="off" inputMode="email" required value={email} disabled={busy}
                                    onChange={event => { setEmail(event.target.value); setError(""); }}
                                    placeholder={role === "OWNER" ? "თანამფლობელის ელფოსტა" : "თანამშრომლის ელფოსტა"}
                                    className={inputClass} />
                            </label>
                        )}

                        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={close} disabled={busy}
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">
                                გაუქმება
                            </button>
                            <button type="submit" disabled={busy || !role || !email.trim()}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50">
                                {busy && <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />}
                                {busy ? "იგზავნება…" : role === "OWNER" ? "თანამფლობელის დამატება" : "თანამშრომლის დამატება"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </dialog>
    );
}
