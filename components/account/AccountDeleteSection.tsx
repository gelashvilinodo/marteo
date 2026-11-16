"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { BusinessFate } from "@/lib/account/delete-account";

const inputClass =
    "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-red-600";

// ანგარიშის სამუდამო წაშლა. "card" პროფილის გვერდზეა, "link" ონბორდინგზე (როცა ბიზნესი ჯერ არ არის).
export default function AccountDeleteSection({ variant = "card" }: { variant?: "card" | "link" }) {
    const [open, setOpen] = useState(false);
    if (variant === "link") return <>
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-text-secondary underline-offset-4 transition hover:text-red-600 hover:underline">
            არ აპირებთ გაგრძელებას? ანგარიშის წაშლა
        </button>
        {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </>;
    return (
        <section className="min-w-0 rounded-2xl border-2 border-red-600/40 bg-red-600/5 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold text-red-600">
                <Icon icon="solar:danger-triangle-linear" className="size-5 shrink-0" aria-hidden="true" />
                სახიფათო ზონა
            </h2>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="font-medium text-text-primary">ანგარიშის წაშლა</p>
                    <p className="mt-1 text-sm text-text-secondary">
                        წაიშლება თქვენი სახელი, ელფოსტა, ტელეფონი და ფოტო. ბიზნესი, რომელსაც მარტო ფლობთ, ყველა მონაცემთან ერთად წაიშლება. ამის დაბრუნება შეუძლებელია.
                    </p>
                </div>
                <button type="button" onClick={() => setOpen(true)}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center delete-action rounded-xl border px-4 text-sm font-semibold transition">
                    ანგარიშის წაშლა
                </button>
            </div>
            {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
        </section>
    );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [businesses, setBusinesses] = useState<BusinessFate[] | null>(null);
    const [blocked, setBlocked] = useState(false);
    const [password, setPassword] = useState("");
    const [understood, setUnderstood] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        let active = true;
        fetch("/api/profile/delete", { cache: "no-store" })
            .then(response => response.json() as Promise<{ success?: boolean; blocked?: boolean; businesses?: BusinessFate[]; message?: string }>)
            .then(data => {
                if (!active) return;
                if (!data.success) { setError(data.message || "ინფორმაცია ვერ ჩაიტვირთა."); setBusinesses([]); return; }
                setBlocked(Boolean(data.blocked));
                setBusinesses(data.businesses ?? []);
            })
            .catch(() => { if (active) { setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა."); setBusinesses([]); } });
        return () => { active = false; element?.close(); };
    }, []);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/profile/delete", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
            });
            const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
            if (!response.ok || !data.success) { setError(data.message || "წაშლა ვერ მოხერხდა. სცადეთ ხელახლა."); return; }
            // სესია უკვე წაშლილია: სრული გადატვირთვა ყველა ქეშს ასუფთავებს.
            window.location.replace("/?account=deleted");
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადეთ ხელახლა.");
        } finally {
            setBusy(false);
        }
    }

    const deleting = businesses?.filter(business => business.fate === "delete") ?? [];

    return (
        <dialog ref={dialog} aria-labelledby={titleId} aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-red-600/40 bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
            <form onSubmit={submit} noValidate className="space-y-4 p-4 sm:p-5">
                <h2 id={titleId} className="flex items-center gap-2 font-semibold text-red-600">
                    <Icon icon="solar:trash-bin-trash-linear" className="size-5 shrink-0" aria-hidden="true" />
                    ანგარიშის წაშლა
                </h2>
                {businesses === null && <p className="flex items-center gap-2 text-sm text-text-secondary">
                    <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />იტვირთება...
                </p>}
                {blocked && <p className="text-sm text-text-secondary">პლატფორმის ადმინის ანგარიშის წაშლა შეუძლებელია.</p>}
                {businesses !== null && !blocked && <>
                    <p className="text-sm text-text-secondary">წაიშლება თქვენი სახელი, ელფოსტა, ტელეფონი, ფოტო, შეტყობინებები და ყველა მოწყობილობიდან შესვლა.</p>
                    {businesses.length > 0 && <ul className="space-y-2 rounded-xl bg-background p-3 text-sm">
                        {businesses.map(business => <li key={business.id} className="flex items-start gap-2">
                            <Icon icon={business.fate === "delete" ? "solar:trash-bin-trash-linear" : "solar:logout-2-linear"}
                                className={`mt-0.5 size-4 shrink-0 ${business.fate === "delete" ? "text-red-600" : "text-text-secondary"}`} aria-hidden="true" />
                            <span className="min-w-0 break-words">
                                <strong className="font-medium">„{business.name}“</strong>{" "}
                                <span className="text-text-secondary">
                                    {business.fate === "delete"
                                        ? `წაიშლება ყველა შეკვეთით, მარაგით და კლიენტით.${business.otherMembers ? ` გუნდის ${business.otherMembers} წევრი შეტყობინებას მიიღებს.` : ""}`
                                        : business.role === "OWNER" ? "დარჩება სხვა მფლობელთან, თქვენ გამოხვალთ." : "დარჩება, თქვენ გუნდიდან გამოხვალთ."}
                                </span>
                            </span>
                        </li>)}
                    </ul>}
                    {deleting.length > 0 && <p className="text-sm text-red-600">თუ ბიზნესის შენახვა გსურთ, ჯერ ბიზნესის პარამეტრებიდან სხვა მფლობელი დაამატეთ.</p>}
                    <label className="block text-sm font-medium">
                        თქვენი პაროლი
                        <input type="password" value={password} disabled={busy} autoComplete="current-password" onChange={event => { setPassword(event.target.value); setError(""); }} className={inputClass} />
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={understood} disabled={busy} onChange={event => setUnderstood(event.target.checked)} className="mt-0.5 [--checkbox-color:var(--marteo-danger)]" />
                        <span>მესმის, რომ ანგარიშის{deleting.length ? " და ჩამოთვლილი ბიზნესების" : ""} დაბრუნება შეუძლებელია</span>
                    </label>
                </>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} disabled={busy}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">
                        დატოვება
                    </button>
                    {!blocked && <button type="submit" disabled={busy || businesses === null || !password || !understood}
                        className="inline-flex min-h-10 items-center justify-center delete-button gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50">
                        {busy && <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />}
                        სამუდამოდ წაშლა
                    </button>}
                </div>
            </form>
        </dialog>
    );
}
