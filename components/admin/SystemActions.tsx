"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { SystemBannerView } from "@/lib/admin/system";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";

async function send(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
    return data.message ?? "";
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function ResolveErrorButton({ id }: { id: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    return <span className="flex shrink-0 flex-col items-end">
        <button type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try { await send("/api/admin/system/errors", json({ id })); router.refresh(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "ვერ მოინიშნა."); }
            finally { setBusy(false); }
        }} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-success/10 hover:text-success disabled:opacity-50">
            <Icon icon="solar:check-circle-linear" className="h-4 w-4" aria-hidden="true" /> მოგვარდა
        </button>
        {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>;
}

export function ResolveAllButton({ count }: { count: number }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    return <>
        <button type="button" onClick={() => { setError(""); setOpen(true); }}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-text-primary transition hover:bg-background">
            <Icon icon="solar:checklist-minimalistic-linear" className="h-4 w-4" aria-hidden="true" /> ყველა მოგვარდა
        </button>
        <ConfirmDialog open={open} title="ყველა შეცდომა მოგვარებულია?" confirmLabel="მონიშვნა" busy={busy} error={error}
            onConfirm={async () => {
                setBusy(true); setError("");
                try { await send("/api/admin/system/errors", json({ all: true })); setOpen(false); router.refresh(); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "ვერ მოინიშნა."); }
                finally { setBusy(false); }
            }} onClose={() => { if (!busy) setOpen(false); }}>
            {count} ღია შეცდომა მოგვარებულად მოინიშნება. რომელიც ისევ მოხდება, სიაში დაბრუნდება.
        </ConfirmDialog>
    </>;
}

const STATE_LABELS: Record<SystemBannerView["state"], { label: string; tone: string }> = {
    active: { label: "ჩანს ახლა", tone: "bg-success/12 text-success" },
    scheduled: { label: "დაგეგმილი", tone: "bg-accent/12 text-accent" },
    ended: { label: "დასრულდა", tone: "bg-background text-text-secondary" },
};

const when = (date: Date) => `${formatSupportDate(date.toISOString())}, ${formatSupportTime(date.toISOString())}`;

export function BannerManager({ banners }: { banners: SystemBannerView[] }) {
    const router = useRouter();
    const [message, setMessage] = useState("");
    const [tone, setTone] = useState<"INFO" | "WARNING">("WARNING");
    const [startsAt, setStartsAt] = useState("");
    const [endsAt, setEndsAt] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [canceling, setCanceling] = useState<SystemBannerView | null>(null);

    const create = async () => {
        setBusy(true); setError(""); setNotice("");
        try {
            setNotice(await send("/api/admin/system/banners", json({ message, tone, startsAt, endsAt })));
            setMessage(""); setStartsAt(""); setEndsAt("");
            router.refresh();
        } catch (cause) { setError(cause instanceof Error ? cause.message : "ვერ შეინახა."); }
        finally { setBusy(false); }
    };

    const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        <label className="block text-xs text-text-secondary">ტექსტი (ჩანს ყველა მომხმარებლის დაშბორდის თავში)
            <input value={message} onChange={event => setMessage(event.target.value)} maxLength={200} placeholder="მაგ.: ხვალ 02:00-03:00 ტექნიკური სამუშაოები, სისტემა შეიძლება შეფერხდეს."
                className={`mt-1 ${field}`} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-secondary">ფერი
                <select value={tone} onChange={event => setTone(event.target.value as "INFO" | "WARNING")} className={`mt-1 ${field}`}>
                    <option value="WARNING">გაფრთხილება (ყვითელი)</option>
                    <option value="INFO">ინფორმაცია (ლურჯი)</option>
                </select>
            </label>
            <label className="text-xs text-text-secondary">დაწყება (ცარიელი = ახლავე)
                <input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className={`mt-1 ${field}`} />
            </label>
            <label className="text-xs text-text-secondary">დასრულება (ცარიელი = ხელით მოხსნამდე)
                <input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className={`mt-1 ${field}`} />
            </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
            {error && !canceling ? <p role="alert" className="text-xs text-danger">{error}</p> : <p className="text-[11px] text-text-secondary">დრო თბილისისაა.</p>}
            <button type="button" onClick={create} disabled={busy || !message.trim()}
                className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40">{busy && !canceling ? "ინახება…" : "გამოქვეყნება"}</button>
        </div>

        <ul className="mt-4 flex flex-col">
            {banners.map(banner => <li key={banner.id} className="flex gap-3 border-t border-border py-2.5">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${banner.tone === "WARNING" ? "bg-warning" : "bg-accent"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-text-primary">{banner.message}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-secondary">
                        <span className={`rounded-full px-1.5 font-medium ${STATE_LABELS[banner.state].tone}`}>{STATE_LABELS[banner.state].label}</span>
                        <span>{when(banner.startsAt)} - {banner.canceledAt ? `მოიხსნა ${when(banner.canceledAt)}` : banner.endsAt ? when(banner.endsAt) : "ხელით მოხსნამდე"}</span>
                    </p>
                </div>
                {banner.state !== "ended" && <button type="button" onClick={() => { setError(""); setCanceling(banner); }}
                    className="h-8 shrink-0 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-danger/10 hover:text-danger">მოხსნა</button>}
            </li>)}
            {!banners.length && <li className="border-t border-border py-2.5 text-xs text-text-secondary">ბანერი ჯერ არ ყოფილა.</li>}
        </ul>
        <ConfirmDialog open={Boolean(canceling)} title="ბანერის მოხსნა" confirmLabel="მოხსნა" danger busy={busy} error={canceling ? error : ""}
            onConfirm={async () => {
                if (!canceling) return;
                setBusy(true); setError("");
                try { setNotice(await send(`/api/admin/system/banners/${canceling.id}`, { method: "DELETE" })); setCanceling(null); router.refresh(); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "ვერ მოიხსნა."); }
                finally { setBusy(false); }
            }} onClose={() => { if (!busy) setCanceling(null); }}>
            ბანერი მომხმარებლებს აღარ გამოუჩნდებათ.
        </ConfirmDialog>
    </div>;
}
