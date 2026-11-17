"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { authCardClass, authErrorClass, authInputClass, authLabelClass, authPrimaryButtonClass } from "@/components/auth/AuthShell";

type Invite = { email: string; inviterName: string; accountExists: boolean };
type State =
    | { kind: "loading" }
    | { kind: "invalid" }
    | { kind: "expired" }
    | { kind: "error"; message: string }
    | { kind: "ready"; invite: Invite; signedInEmail: string | null };

function Notice({ icon, title, text, href = "/login", action = "შესვლის გვერდზე გადასვლა" }: { icon: string; title: string; text: string; href?: string; action?: string }) {
    return <div className={`${authCardClass} text-center`}>
        <Icon icon={icon} className="mx-auto size-12 text-text-secondary" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p>
        <Link href={href} className={`mt-6 ${authPrimaryButtonClass}`}>{action}</Link>
    </div>;
}

// ადმინ პანელის მოწვევის მიღება. ტოკენი URL-ის ფრაგმენტშია და მაშინვე იშლება მისამართის ზოლიდან.
export default function AdminInviteAcceptForm() {
    const token = useRef("");
    const running = useRef(false);
    const [state, setState] = useState<State>({ kind: "loading" });
    const [password, setPassword] = useState("");
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const value = token.current || (new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
        token.current = value;
        if (value) window.history.replaceState(null, "", window.location.pathname);
        const controller = new AbortController();
        (async () => {
            if (!/^[a-f0-9]{64}$/.test(value)) { setState({ kind: "invalid" }); return; }
            try {
                const response = await fetch("/api/admin-invite/lookup", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: value }), signal: controller.signal,
                });
                const data = await response.json().catch(() => ({})) as Partial<Invite> & { state?: string; signedInEmail?: string | null; message?: string };
                if (data.state === "ready" && data.email) {
                    setState({ kind: "ready", invite: { email: data.email, inviterName: data.inviterName ?? "MARTEO", accountExists: Boolean(data.accountExists) }, signedInEmail: data.signedInEmail ?? null });
                } else if (data.state === "expired") setState({ kind: "expired" });
                else if (data.state === "invalid") setState({ kind: "invalid" });
                else setState({ kind: "error", message: data.message || "მოწვევის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა." });
            } catch (cause) {
                if ((cause as Error).name !== "AbortError") setState({ kind: "error", message: "კავშირი ვერ დამყარდა. სცადეთ ხელახლა." });
            }
        })();
        return () => controller.abort();
    }, []);

    if (state.kind === "loading") {
        return <div className={`${authCardClass} flex items-center justify-center gap-2 py-12 text-sm text-text-secondary`} role="status">
            <Icon icon="solar:refresh-linear" className="size-5 animate-spin" aria-hidden="true" />მოწვევა მოწმდება…
        </div>;
    }
    if (state.kind === "invalid") return <Notice icon="solar:link-broken-linear" title="ბმული აღარ მოქმედებს" text="მოწვევა უკვე გამოყენებულია, გაუქმებულია ან ბმული არასრულად დაკოპირდა." />;
    if (state.kind === "expired") return <Notice icon="solar:clock-circle-linear" title="ბმულს ვადა გაუვიდა" text="სთხოვეთ მომწვევს ახალი მოწვევის გამოგზავნა." />;
    if (state.kind === "error") return <Notice icon="solar:danger-triangle-linear" title="რაღაც ვერ მოხერხდა" text={state.message} />;

    const { invite, signedInEmail } = state;
    if (!invite.accountExists) {
        return <Notice icon="solar:user-plus-linear" title="ჯერ შექმენით ანგარიში"
            text={`ადმინად მოწვევისთვის საჭიროა MARTEO-ს ანგარიში ელფოსტით ${invite.email}. დარეგისტრირდით ამ ელფოსტით და შემდეგ წერილში მიღებული ბმული თავიდან გახსენით.`}
            href="/register" action="რეგისტრაცია" />;
    }
    const signedInAsInvitee = signedInEmail?.toLowerCase() === invite.email.toLowerCase();

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (running.current) return;
        if (!signedInAsInvitee && !password) { setError("ჩაწერეთ პაროლი."); return; }
        running.current = true;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/admin-invite/accept", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token.current, mode: signedInAsInvitee ? "signed-in" : "password", password }),
            });
            const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string; redirectTo?: string };
            if (!response.ok || !data.success) { setError(data.message || "მოწვევის მიღება ვერ მოხერხდა. სცადეთ ხელახლა."); return; }
            // სრული გადატვირთვა: ახალი სესია და შემდეგ ორეტაპიანი შესვლის ჩართვა.
            window.location.assign(data.redirectTo || "/admin-login");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა.");
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    return <form onSubmit={submit} noValidate className={authCardClass}>
        <div className="mb-6">
            <p className="text-sm text-text-secondary">{invite.inviterName} გიწვევთ</p>
            <h1 className="mt-1 text-2xl font-semibold text-text-primary">MARTEO-ს ადმინ პანელში</h1>
            <div className="mt-3 rounded-xl bg-background p-3 text-sm text-text-secondary">
                <p className="flex items-center gap-2 font-medium text-text-primary">
                    <Icon icon="solar:shield-user-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />ადმინი
                </p>
                <p className="mt-1">დაინახავთ ყველა ბიზნესს, მომხმარებელს და გადახდას. მიღების შემდეგ ჩართავთ ორეტაპიან შესვლას (კოდის აპით, მაგალითად Google Authenticator).</p>
            </div>
        </div>

        <fieldset disabled={busy} className="grid min-w-0 gap-4">
            <div>
                <span className={authLabelClass}>ელფოსტა</span>
                <p className="flex h-11 items-center rounded-xl border border-border bg-background px-3 text-[16px] text-text-secondary break-all">{invite.email}</p>
            </div>
            {!signedInAsInvitee && <div>
                {signedInEmail && <p className="mb-3 text-sm text-text-secondary">ახლა შესული ხართ {signedInEmail}-ით. მოწვევის მისაღებად შეიყვანეთ {invite.email}-ის პაროლი.</p>}
                <label htmlFor="admin-invite-password" className={authLabelClass}>პაროლი</label>
                <div className="relative">
                    <input id="admin-invite-password" type={visible ? "text" : "password"} autoComplete="current-password" required value={password}
                        onChange={event => { setPassword(event.target.value); setError(""); }} className={`${authInputClass(Boolean(error))} pr-24`} />
                    <button type="button" aria-controls="admin-invite-password" aria-label={visible ? "პაროლის დამალვა" : "პაროლის ჩვენება"} onClick={() => setVisible(value => !value)}
                        className="absolute inset-y-0 right-3 my-auto h-8 rounded px-2 text-xs font-medium text-text-secondary transition hover:text-accent">
                        {visible ? "დამალვა" : "ჩვენება"}
                    </button>
                </div>
            </div>}
            {error && <p role="alert" className={authErrorClass}>{error}</p>}
            <button type="submit" className={authPrimaryButtonClass}>{busy ? "მოწმდება…" : "მოწვევის მიღება"}</button>
        </fieldset>
    </form>;
}
