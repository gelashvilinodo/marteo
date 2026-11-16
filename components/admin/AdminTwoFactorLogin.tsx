"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthShell, { authCardClass, authErrorClass, authInputClass, authLabelClass, authPrimaryButtonClass } from "@/components/auth/AuthShell";

type Mode = "verify" | "setup";
type SetupData = { secret: string; uri: string; qr: string };

async function post<T>(path: string, body: object): Promise<T> {
    const response = await fetch(`/api/admin/2fa/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
    return data;
}

// სარეზერვო კოდების ჩვენება ერთხელ: კოპირება ან ფაილად შენახვა.
export function BackupCodesList({ codes }: { codes: string[] }) {
    const [copied, setCopied] = useState(false);
    const text = `MARTEO ადმინის სარეზერვო კოდები (თითო ერთხელ მუშაობს)\n\n${codes.join("\n")}\n`;
    return <div>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-4 font-mono text-sm text-text-primary">
            {codes.map(code => <li key={code} className="text-center tracking-wider">{code}</li>)}
        </ul>
        <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)); }}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm text-text-primary transition hover:bg-background">
                <Icon icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"} className="h-4 w-4" aria-hidden="true" />{copied ? "დაკოპირდა" : "კოპირება"}
            </button>
            <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="marteo-admin-backup-codes.txt"
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm text-text-primary transition hover:bg-background">
                <Icon icon="solar:download-minimalistic-linear" className="h-4 w-4" aria-hidden="true" />ფაილად შენახვა
            </a>
        </div>
    </div>;
}

function CodeInput({ value, onChange, backup, id }: { value: string; onChange: (value: string) => void; backup: boolean; id: string }) {
    return <input id={id} value={value} autoFocus autoComplete="one-time-code" spellCheck={false}
        inputMode={backup ? "text" : "numeric"} maxLength={backup ? 11 : 6} placeholder={backup ? "xxxxx-xxxxx" : "000000"}
        onChange={event => onChange(backup ? event.target.value.toLowerCase() : event.target.value.replace(/\D/g, ""))}
        className={`${authInputClass(false)} text-center font-mono text-xl tracking-[0.3em]`} />;
}

function Remember({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
    return <label className="flex items-start gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5" />
        <span>ამ მოწყობილობის დამახსოვრება 30 დღით<span className="block text-xs text-text-secondary">სხვის კომპიუტერზე მოხსენით მონიშვნა.</span></span>
    </label>;
}

export default function AdminTwoFactorLogin({ mode, email }: { mode: Mode; email: string }) {
    const router = useRouter();
    const [step, setStep] = useState<"password" | "scan" | "codes" | "code">(mode === "setup" ? "password" : "code");
    const [password, setPassword] = useState("");
    const [setup, setSetup] = useState<SetupData | null>(null);
    const [code, setCode] = useState("");
    const [backup, setBackup] = useState(false);
    const [remember, setRemember] = useState(true);
    const [codes, setCodes] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError("");
        try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა."); }
        finally { setBusy(false); }
    };
    const enter = () => { router.replace("/admin"); router.refresh(); };

    const heading = <>ადმინ პანელი.<br />მეორე ნაბიჯი.</>;
    const text = "ადმინ პანელში შესასვლელად პაროლის გარდა ტელეფონის აპის კოდიც საჭიროა.";

    return <AuthShell heading={heading} text={text}>
        <form noValidate aria-busy={busy} className={authCardClass} onSubmit={event => {
            event.preventDefault();
            if (step === "password") void run(async () => { setSetup(await post<SetupData>("setup", { password })); setPassword(""); setStep("scan"); });
            if (step === "scan") void run(async () => { const data = await post<{ backupCodes: string[] }>("enable", { code, remember }); setCodes(data.backupCodes); setStep("codes"); });
            if (step === "code") void run(async () => { await post("verify", { code, remember }); enter(); });
            if (step === "codes" && saved) enter();
        }}>
            {step === "code" && <>
                <h1 className="text-2xl font-semibold text-text-primary">შეიყვანეთ კოდი</h1>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {backup ? "შეიყვანეთ ერთ-ერთი სარეზერვო კოდი. გამოყენების შემდეგ ის აღარ იმუშავებს." : "გახსენით კოდის აპი (Google Authenticator, Apple Passwords) და შეიყვანეთ MARTEO Admin-ის 6-ნიშნა კოდი."}
                </p>
                <fieldset disabled={busy} className="mt-6 grid gap-4">
                    <div>
                        <label htmlFor="admin-code" className={authLabelClass}>{backup ? "სარეზერვო კოდი" : "კოდი აპიდან"}</label>
                        <CodeInput id="admin-code" value={code} onChange={setCode} backup={backup} />
                    </div>
                    <Remember checked={remember} onChange={setRemember} />
                    {error && <p role="alert" className={authErrorClass}>{error}</p>}
                    <button type="submit" disabled={backup ? code.replace(/[^a-z0-9]/g, "").length !== 10 : code.length !== 6} className={authPrimaryButtonClass}>{busy ? "მოწმდება..." : "შესვლა"}</button>
                    <button type="button" onClick={() => { setBackup(!backup); setCode(""); setError(""); }} className="text-sm text-accent hover:underline">
                        {backup ? "კოდი აპიდან" : "ტელეფონი არ მაქვს: სარეზერვო კოდი"}
                    </button>
                </fieldset>
            </>}

            {step === "password" && <>
                <h1 className="text-2xl font-semibold text-text-primary">ორეტაპიანი შესვლის ჩართვა</h1>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                    ეს ერთხელ კეთდება. ტელეფონზე დაგჭირდებათ კოდის აპი: Google Authenticator ან iPhone-ზე ჩაშენებული „Passwords“. ჯერ დაადასტურეთ პაროლი ({email}).
                </p>
                <fieldset disabled={busy} className="mt-6 grid gap-4">
                    <div>
                        <label htmlFor="admin-password" className={authLabelClass}>პაროლი</label>
                        <input id="admin-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={event => setPassword(event.target.value)} className={authInputClass(false)} />
                    </div>
                    {error && <p role="alert" className={authErrorClass}>{error}</p>}
                    <button type="submit" disabled={!password} className={authPrimaryButtonClass}>{busy ? "მოწმდება..." : "გაგრძელება"}</button>
                </fieldset>
            </>}

            {step === "scan" && setup && <>
                <h1 className="text-2xl font-semibold text-text-primary">დაასკანერეთ QR კოდი</h1>
                <p className="mt-2 text-sm leading-6 text-text-secondary">კოდის აპში დააჭირეთ „+“ და დაასკანერეთ. ტელეფონიდან ხსნით? ჩასვით გასაღები ხელით.</p>
                <div className="mx-auto mt-5 w-48 rounded-2xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full" aria-label="QR კოდი კოდის აპისთვის" role="img" dangerouslySetInnerHTML={{ __html: setup.qr }} />
                <div className="mt-4 rounded-xl bg-background px-3 py-2 text-center">
                    <p className="text-xs text-text-secondary">გასაღები ხელით შესაყვანად</p>
                    <p className="select-all break-all font-mono text-sm tracking-wider text-text-primary">{setup.secret}</p>
                </div>
                <a href={setup.uri} className="mt-2 block text-center text-sm text-accent hover:underline">ამ ტელეფონზე აპში გახსნა</a>
                <fieldset disabled={busy} className="mt-5 grid gap-4">
                    <div>
                        <label htmlFor="admin-first-code" className={authLabelClass}>აპში გამოჩენილი 6-ნიშნა კოდი</label>
                        <CodeInput id="admin-first-code" value={code} onChange={setCode} backup={false} />
                    </div>
                    <Remember checked={remember} onChange={setRemember} />
                    {error && <p role="alert" className={authErrorClass}>{error}</p>}
                    <button type="submit" disabled={code.length !== 6} className={authPrimaryButtonClass}>{busy ? "მოწმდება..." : "ჩართვა"}</button>
                </fieldset>
            </>}

            {step === "codes" && <>
                <h1 className="text-2xl font-semibold text-text-primary">შეინახეთ სარეზერვო კოდები</h1>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                    ტელეფონი თუ დაიკარგა, ამ კოდებით შეხვალთ. თითო ერთხელ მუშაობს. ისინი მეტჯერ აღარ გამოჩნდება: შეინახეთ პაროლების მენეჯერში ან ამობეჭდეთ.
                </p>
                <div className="mt-5"><BackupCodesList codes={codes} /></div>
                <label className="mt-5 flex items-start gap-2 text-sm text-text-primary">
                    <input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} className="mt-0.5" />
                    <span>კოდები შევინახე</span>
                </label>
                <button type="submit" disabled={!saved} className={`mt-4 w-full ${authPrimaryButtonClass}`}>ადმინ პანელში გადასვლა</button>
            </>}
        </form>
    </AuthShell>;
}
