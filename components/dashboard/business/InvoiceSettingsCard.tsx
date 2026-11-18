"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import type { InvoicePaper } from "@/lib/orders/invoice-paper";
import type { InvoicePhoneMode, InvoiceSettings } from "@/lib/business/invoice-settings";

const papers: { value: InvoicePaper; label: string; hint: string }[] = [
    { value: "a4", label: "A4", hint: "ჩვეულებრივი ფურცელი" },
    { value: "100x150", label: "10 × 15 სმ", hint: "სტიკერი / ეტიკეტი" },
    { value: "80mm", label: "80 მმ", hint: "თერმული პრინტერი" },
    { value: "58mm", label: "58 მმ", hint: "თერმული პრინტერი" },
];

function choiceClass(selected: boolean) {
    return [
        "flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        selected ? "border-accent bg-accent/10" : "border-border hover:bg-background",
    ].join(" ");
}

// ინვოისის პარამეტრები: ბეჭდვისას თავიდან არჩეული ზომა და ბიზნესის ნომერი ინვოისის თავში.
export default function InvoiceSettingsCard({ initial }: { initial: InvoiceSettings }) {
    const [saved, setSaved] = useState(initial);
    const [paper, setPaper] = useState(initial.paper);
    const [phoneMode, setPhoneMode] = useState(initial.phoneMode);
    const [customPhone, setCustomPhone] = useState(initial.customPhone ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [errorField, setErrorField] = useState<"paper" | "phone" | "form">("form");
    const [notice, setNotice] = useState("");
    const id = useId();

    const dirty = paper !== saved.paper || phoneMode !== saved.phoneMode || (phoneMode === "CUSTOM" && customPhone.trim() !== (saved.customPhone ?? ""));
    const shownPhone = phoneMode === "OFF" ? null : phoneMode === "CUSTOM" ? customPhone.trim() || null : saved.accountPhone;

    function edited() { setNotice(""); setError(""); }

    async function save() {
        setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/business/invoice", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paper, phoneMode, customPhone }),
            });
            const data = await response.json().catch(() => ({})) as { settings?: InvoiceSettings; message?: string; error?: string; field?: "paper" | "phone" | "form" };
            if (!response.ok || !data.settings) {
                setErrorField(data.field ?? "form");
                throw new Error(data.message || data.error || "პარამეტრები ვერ შეინახა.");
            }
            setSaved(data.settings);
            setPaper(data.settings.paper);
            setPhoneMode(data.settings.phoneMode);
            setCustomPhone(data.settings.customPhone ?? "");
            setNotice("ინვოისის პარამეტრები შენახულია.");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "პარამეტრები ვერ შეინახა.");
        } finally { setBusy(false); }
    }

    const phoneOptions: { value: InvoicePhoneMode; label: string; detail: string }[] = [
        { value: "ACCOUNT", label: "რეგისტრაციის ნომერი", detail: saved.accountPhone ?? "ნომერი ვერ მოიძებნა" },
        { value: "CUSTOM", label: "სხვა ნომერი", detail: "მიუთითეთ ნომერი, რომელიც ინვოისზე გამოჩნდება" },
        { value: "OFF", label: "ნომერი არ მიეთითოს", detail: "ინვოისზე ბიზნესის ნომერი არ გამოჩნდება" },
    ];

    return <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold text-text-primary">
            <Icon icon="solar:document-text-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />ინვოისი
        </h2>
        <p className="mt-1 text-sm text-text-secondary">ბეჭდვის გვერდი არჩეული ზომით გაიხსნება. საჭიროების შემთხვევაში ზომას ბეჭდვისას მაინც შეცვლით.</p>

        <fieldset className="mt-4 min-w-0" disabled={busy}>
            <legend className="text-sm font-medium text-text-primary">ინვოისის ზომა</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {papers.map(option => <label key={option.value} className={choiceClass(paper === option.value)}>
                    <input type="radio" name={`${id}-paper`} value={option.value} checked={paper === option.value}
                        onChange={() => { setPaper(option.value); edited(); }} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
                    <span className="min-w-0">
                        <span className="block font-medium text-text-primary">{option.label}</span>
                        <span className="block text-xs text-text-secondary">{option.hint}</span>
                    </span>
                </label>)}
            </div>
        </fieldset>

        <fieldset className="mt-5 min-w-0" disabled={busy}>
            <legend className="text-sm font-medium text-text-primary">ბიზნესის ნომერი ინვოისზე</legend>
            <p className="mt-1 text-xs text-text-secondary">ჩანს ინვოისის თავში, ბიზნესის სახელის ქვეშ. მომხმარებლის ნომერს არ ეხება.</p>
            <div className="mt-2 grid gap-2">
                {phoneOptions.map(option => <label key={option.value} className={choiceClass(phoneMode === option.value)}>
                    <input type="radio" name={`${id}-phone`} value={option.value} checked={phoneMode === option.value}
                        onChange={() => { setPhoneMode(option.value); edited(); }} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
                    <span className="min-w-0">
                        <span className="block font-medium text-text-primary">{option.label}</span>
                        <span className="block break-words text-xs text-text-secondary">{option.detail}</span>
                    </span>
                </label>)}
            </div>
            {phoneMode === "CUSTOM" && <label className="mt-3 block min-w-0 space-y-2">
                <span className="text-sm text-text-primary">ინვოისის ნომერი</span>
                <input type="tel" inputMode="tel" autoComplete="off" placeholder="+995" value={customPhone}
                    onChange={event => { setCustomPhone(event.target.value); edited(); }}
                    aria-invalid={Boolean(error) && errorField === "phone"}
                    aria-describedby={error && errorField === "phone" ? `${id}-error` : undefined}
                    className={`block min-h-11 w-full max-w-sm min-w-0 rounded-xl border bg-background px-3 py-2 text-base text-text-primary outline-none transition-colors focus:border-accent ${error && errorField === "phone" ? "border-danger" : "border-border"}`} />
            </label>}
        </fieldset>

        <div className="mt-4 rounded-xl bg-background p-3 text-sm">
            <p className="text-xs text-text-secondary">ინვოისის თავში გამოჩნდება</p>
            <p className="mt-1 text-text-primary">{shownPhone ?? "ნომრის გარეშე"}</p>
        </div>

        {error && <p id={`${id}-error`} role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}

        <button type="button" onClick={() => void save()} disabled={busy || !dirty}
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {busy ? "ინახება…" : "შენახვა"}
        </button>
    </section>;
}
