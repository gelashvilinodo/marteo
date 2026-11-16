"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { BackupCodesList } from "./AdminTwoFactorLogin";
import type { AdminDeviceRow } from "@/lib/admin/two-factor";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";

const when = (iso: string) => `${formatSupportDate(iso)}, ${formatSupportTime(iso)}`;
const field = "mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";

async function post<T>(path: string, body: object = {}): Promise<T> {
    const response = await fetch(`/api/admin/2fa/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
    return data;
}

type Dialog = null | "backup" | "reset" | "forget";

export default function AdminSecurityPanel({ initialDevices, backupLeft: initialBackupLeft }: { initialDevices: AdminDeviceRow[]; backupLeft: number }) {
    const router = useRouter();
    const [devices, setDevices] = useState(initialDevices);
    const [backupLeft, setBackupLeft] = useState(initialBackupLeft);
    const [codes, setCodes] = useState<string[]>([]);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const open = (next: Dialog) => { setCode(""); setPassword(""); setError(""); setNotice(""); setDialog(next); };
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError("");
        try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა."); }
        finally { setBusy(false); }
    };
    const revoke = (deviceId: string) => run(async () => {
        const data = await post<{ message: string; devices: AdminDeviceRow[] }>("devices", { deviceId });
        setDevices(data.devices);
        setNotice(data.message);
    });

    const others = devices.filter(device => !device.current).length;

    return <div className="flex flex-col gap-4">
        {notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        {error && !dialog && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-text-primary">სანდო მოწყობილობები</h2>
                {others > 0 && <button type="button" disabled={busy} onClick={() => void revoke("others")}
                    className="h-9 rounded-xl px-3 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-40">სხვა ყველას გაუქმება</button>}
            </div>
            <p className="mt-1 text-sm text-text-secondary">ამ მოწყობილობებზე ადმინ პანელი კოდს ვადის ამოწურვამდე აღარ ითხოვს. უცნობ მოწყობილობას მაშინვე გააუქმებთ და პაროლს შეცვლით.</p>
            <ul className="mt-3 flex flex-col">
                {devices.map(device => <li key={device.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                        <Icon icon={/iPhone|Android/.test(device.label) ? "solar:smartphone-linear" : "solar:monitor-linear"} className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">{device.label}
                            {device.current && <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] text-success">ეს მოწყობილობა</span>}</p>
                        <p className="text-xs text-text-secondary">დაემატა {when(device.createdAt)} · მოქმედებს {formatSupportDate(device.expiresAt)}-მდე</p>
                    </div>
                    {device.current
                        ? <button type="button" disabled={busy} onClick={() => open("forget")} className="h-8 shrink-0 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-background">გასვლა</button>
                        : <button type="button" disabled={busy} onClick={() => void revoke(device.id)} className="h-8 shrink-0 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-danger/10 hover:text-danger">გაუქმება</button>}
                </li>)}
            </ul>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-text-primary">სარეზერვო კოდები</h2>
            <p className={`mt-1 text-sm ${backupLeft <= 3 ? "text-danger" : "text-text-secondary"}`}>
                დარჩა {backupLeft} ერთჯერადი კოდი. {backupLeft <= 3 ? "გირჩევთ ახლის შექმნას." : "ტელეფონის დაკარგვისას გამოგადგებათ."}
            </p>
            {codes.length > 0 && <div className="mt-3">
                <p className="mb-2 text-sm text-text-primary">ახალი კოდები: შეინახეთ ახლავე, მეტჯერ აღარ გამოჩნდება. ძველები აღარ მუშაობს.</p>
                <BackupCodesList codes={codes} />
            </div>}
            <button type="button" onClick={() => open("backup")} className="mt-3 h-10 rounded-xl border border-border px-4 text-sm text-text-primary transition hover:bg-background">ახალი კოდების შექმნა</button>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-text-primary">ახალი ტელეფონი</h2>
            <p className="mt-1 text-sm text-text-secondary">ტელეფონის შეცვლისას ორეტაპიანი შესვლა თავიდან ჩაირთვება: ძველი კოდები და ყველა სანდო მოწყობილობა გაუქმდება და ახალ QR კოდს დაასკანერებთ.</p>
            <button type="button" onClick={() => open("reset")} className="mt-3 h-10 rounded-xl border border-danger/40 px-4 text-sm text-danger transition hover:bg-danger/10">თავიდან ჩართვა</button>
        </section>

        <ConfirmDialog open={dialog === "backup"} title="ახალი სარეზერვო კოდები" confirmLabel="შექმნა" busy={busy} error={dialog === "backup" ? error : ""}
            onClose={() => { if (!busy) setDialog(null); }}
            onConfirm={() => void run(async () => {
                const data = await post<{ backupCodes: string[] }>("backup-codes", { code });
                setCodes(data.backupCodes);
                setBackupLeft(data.backupCodes.length);
                setDialog(null);
            })}>
            <span className="block">ძველი კოდები მაშინვე გაუქმდება. დასადასტურებლად შეიყვანეთ კოდი აპიდან.</span>
            <input value={code} onChange={event => setCode(event.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" maxLength={11} placeholder="000000" aria-label="კოდი აპიდან" className={field} />
        </ConfirmDialog>

        <ConfirmDialog open={dialog === "reset"} danger title="ორეტაპიანი შესვლის თავიდან ჩართვა" confirmLabel="გაგრძელება" busy={busy} error={dialog === "reset" ? error : ""}
            onClose={() => { if (!busy) setDialog(null); }}
            onConfirm={() => void run(async () => { await post("reset", { password, code }); router.replace("/admin-login"); })}>
            <span className="block">ყველა მოწყობილობა გაუქმდება და ახალ ტელეფონზე QR კოდის დასკანერება მოგიწევთ. დაადასტურეთ პაროლითა და ძველი აპის კოდით.</span>
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" placeholder="პაროლი" aria-label="პაროლი" className={field} />
            <input value={code} onChange={event => setCode(event.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" maxLength={11} placeholder="კოდი აპიდან ან სარეზერვო" aria-label="კოდი" className={field} />
        </ConfirmDialog>

        <ConfirmDialog open={dialog === "forget"} title="ამ მოწყობილობიდან გასვლა" confirmLabel="გასვლა" busy={busy} error={dialog === "forget" ? error : ""}
            onClose={() => { if (!busy) setDialog(null); }}
            onConfirm={() => void run(async () => { await post("forget"); router.replace("/dashboard"); })}>
            <span className="block">ამ ბრაუზერში ადმინ პანელი შემდეგ ჯერზე ისევ კოდს მოითხოვს. მართეოს ანგარიშიდან არ გამოხვალთ.</span>
        </ConfirmDialog>
    </div>;
}
