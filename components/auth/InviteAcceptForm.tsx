"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shared/Icon";

import {
    authCardClass,
    authErrorClass,
    authInputClass,
    authLabelClass,
    authPrimaryButtonClass,
} from "@/components/auth/AuthShell";
import { PERMISSION_OPTIONS } from "@/lib/business/team";

type Invite = {
    email: string;
    role: "OWNER" | "MEMBER";
    permissions: string[];
    readOnly: boolean;
    businessName: string;
    inviterName: string;
    accountExists: boolean;
};

type State =
    | { kind: "loading" }
    | { kind: "invalid" }
    | { kind: "expired" }
    | { kind: "error"; message: string }
    | { kind: "ready"; invite: Invite; signedInEmail: string | null };

function PasswordInput({ id, value, onChange, autoComplete, disabled }: {
    id: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled: boolean;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} required value={value} disabled={disabled}
                onChange={event => onChange(event.target.value)} placeholder="მინიმუმ 8 სიმბოლო" className={`${authInputClass()} pr-24`} />
            <button type="button" aria-controls={id} aria-label={visible ? "პაროლის დამალვა" : "პაროლის ჩვენება"}
                onClick={() => setVisible(value => !value)}
                className="absolute inset-y-0 right-3 my-auto h-8 rounded px-2 text-xs font-medium text-text-secondary transition hover:text-accent">
                {visible ? "დამალვა" : "ჩვენება"}
            </button>
        </div>
    );
}

function Notice({ icon, title, text }: { icon: string; title: string; text: string }) {
    return (
        <div className={`${authCardClass} text-center`}>
            <Icon icon={icon} className="mx-auto size-12 text-text-secondary" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-semibold text-text-primary">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p>
            <Link href="/login" className={`mt-6 ${authPrimaryButtonClass}`}>შესვლის გვერდზე გადასვლა</Link>
        </div>
    );
}

export default function InviteAcceptForm() {
    const token = useRef("");
    const running = useRef(false);
    const [state, setState] = useState<State>({ kind: "loading" });
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // ტოკენი URL-ის ფრაგმენტიდან იკითხება და მაშინვე იშლება მისამართის ზოლიდან.
    useEffect(() => {
        // ეფექტი შეიძლება ორჯერ გაეშვას, ფრაგმენტი კი პირველივე ჯერზე იშლება.
        const value = token.current || (new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
        token.current = value;
        if (value) window.history.replaceState(null, "", window.location.pathname);
        const controller = new AbortController();
        (async () => {
            if (!/^[a-f0-9]{64}$/.test(value)) {
                setState({ kind: "invalid" });
                return;
            }
            try {
                const response = await fetch("/api/invites/lookup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: value }),
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => ({})) as {
                    state?: string; invite?: Invite; signedInEmail?: string | null; message?: string;
                };
                if (data.state === "ready" && data.invite) setState({ kind: "ready", invite: data.invite, signedInEmail: data.signedInEmail ?? null });
                else if (data.state === "expired") setState({ kind: "expired" });
                else if (data.state === "invalid") setState({ kind: "invalid" });
                else setState({ kind: "error", message: data.message || "მოწვევის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა." });
            } catch (cause) {
                if ((cause as Error).name !== "AbortError") setState({ kind: "error", message: "კავშირი ვერ დამყარდა. სცადეთ ხელახლა." });
            }
        })();
        return () => controller.abort();
    }, []);

    if (state.kind === "loading") {
        return (
            <div className={`${authCardClass} flex items-center justify-center gap-2 py-12 text-sm text-text-secondary`} role="status">
                <Icon icon="solar:refresh-linear" className="size-5 animate-spin" aria-hidden="true" />
                მოწვევა მოწმდება…
            </div>
        );
    }
    if (state.kind === "invalid") {
        return <Notice icon="solar:link-broken-linear" title="ბმული აღარ მოქმედებს"
            text="მოწვევა უკვე გამოყენებულია, გაუქმებულია ან ბმული არასრულად დაკოპირდა. საჭიროების შემთხვევაში სთხოვეთ მომწვევს ახალი მოწვევა." />;
    }
    if (state.kind === "expired") {
        return <Notice icon="solar:clock-circle-linear" title="ბმულს ვადა გაუვიდა"
            text="სთხოვეთ მომწვევს, მოწვევა ბიზნესის პარამეტრებიდან ხელახლა გამოგიგზავნოს." />;
    }
    if (state.kind === "error") return <Notice icon="solar:danger-triangle-linear" title="რაღაც ვერ მოხერხდა" text={state.message} />;

    const { invite, signedInEmail } = state;
    const signedInAsInvitee = signedInEmail?.toLowerCase() === invite.email;
    const mode = signedInAsInvitee ? "signed-in" : invite.accountExists ? "existing" : "new";
    const permissionLabels = PERMISSION_OPTIONS.filter(option => invite.permissions.includes(option.value)).map(option => option.label);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (running.current) return;
        running.current = true;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/invites/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token.current, mode, firstName, lastName, phone, password }),
            });
            const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string; redirectTo?: string };
            if (!response.ok || !data.success) {
                setError(data.message || "მოწვევის მიღება ვერ მოხერხდა. სცადეთ ხელახლა.");
                return;
            }
            // სრული გადატვირთვა, რომ დაშბორდმა ახალი სესია და ბიზნესი წაიკითხოს.
            window.location.assign(data.redirectTo || "/dashboard");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა.");
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} noValidate className={authCardClass}>
            <div className="mb-6">
                <p className="text-sm text-text-secondary">{invite.inviterName} გიწვევთ</p>
                <h1 className="mt-1 text-2xl font-semibold text-text-primary">„{invite.businessName}“</h1>
                <div className="mt-3 rounded-xl bg-background p-3 text-sm text-text-secondary">
                    <p className="flex items-center gap-2 font-medium text-text-primary">
                        <Icon icon={invite.role === "OWNER" ? "solar:crown-linear" : "solar:user-id-linear"} className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        {invite.role === "OWNER" ? "თანამფლობელი" : "თანამშრომელი"}
                    </p>
                    <p className="mt-1">
                        {invite.role === "OWNER"
                            ? "გექნებათ ბიზნესის მართვის სრული უფლება."
                            : `წვდომა: ${permissionLabels.join(", ")}${invite.readOnly ? " (მხოლოდ ნახვა)" : ""}.`}
                    </p>
                </div>
            </div>

            <fieldset disabled={busy} className="grid min-w-0 gap-4">
                <div>
                    <span className={authLabelClass}>ელფოსტა</span>
                    <p className="flex h-11 items-center rounded-xl border border-border bg-background px-3 text-[16px] text-text-secondary break-all">{invite.email}</p>
                </div>

                {mode === "new" && (
                    <>
                        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                            <div className="min-w-0">
                                <label htmlFor="invite-first-name" className={authLabelClass}>სახელი</label>
                                <input id="invite-first-name" autoComplete="given-name" required value={firstName}
                                    onChange={event => { setFirstName(event.target.value); setError(""); }} className={authInputClass()} />
                            </div>
                            <div className="min-w-0">
                                <label htmlFor="invite-last-name" className={authLabelClass}>გვარი</label>
                                <input id="invite-last-name" autoComplete="family-name" required value={lastName}
                                    onChange={event => { setLastName(event.target.value); setError(""); }} className={authInputClass()} />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="invite-phone" className={authLabelClass}>ტელეფონის ნომერი</label>
                            <input id="invite-phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} placeholder="599 12 34 56"
                                onChange={event => { setPhone(event.target.value); setError(""); }} className={authInputClass()} />
                        </div>
                        <div>
                            <label htmlFor="invite-password" className={authLabelClass}>შექმენით პაროლი</label>
                            <PasswordInput id="invite-password" value={password} autoComplete="new-password" disabled={busy}
                                onChange={value => { setPassword(value); setError(""); }} />
                        </div>
                    </>
                )}

                {mode === "existing" && (
                    <div>
                        <p className="mb-3 text-sm text-text-secondary">
                            ამ ელფოსტით ანგარიში უკვე გაქვთ. თქვენი ბიზნესი და მონაცემები უცვლელი დარჩება, ახალ ბიზნესზე კი პროფილის მენიუდან გადახვალთ.
                        </p>
                        <label htmlFor="invite-current-password" className={authLabelClass}>თქვენი პაროლი</label>
                        <PasswordInput id="invite-current-password" value={password} autoComplete="current-password" disabled={busy}
                            onChange={value => { setPassword(value); setError(""); }} />
                        <div className="mt-2 flex justify-end">
                            <Link href="/forgot-password" className="inline-flex min-h-10 items-center text-sm text-accent hover:text-accent-hover">
                                დამავიწყდა პაროლი
                            </Link>
                        </div>
                    </div>
                )}

                {mode === "signed-in" && (
                    <p className="text-sm text-text-secondary">
                        თქვენი ბიზნესი და მონაცემები უცვლელი დარჩება. ახალ ბიზნესზე პროფილის მენიუდან გადახვალთ.
                    </p>
                )}
            </fieldset>

            {error && <div role="alert" className={`mt-4 ${authErrorClass}`}>{error}</div>}

            <button type="submit"
                disabled={busy || (mode === "new" && (!firstName.trim() || !lastName.trim() || !phone.trim() || !password)) || (mode === "existing" && !password)}
                className={`mt-5 ${authPrimaryButtonClass}`}>
                {busy && <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />}
                {busy ? "მიმდინარეობს…" : "მოწვევის მიღება"}
            </button>
        </form>
    );
}
