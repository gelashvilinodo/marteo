"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import AdminCodeField from "./AdminCodeField";
import type { BusinessFate } from "@/lib/account/delete-account";

// ანგარიშის სამუდამო წაშლა: დიალოგში ჩანს, რა ბედი ეწევა თითოეულ ბიზნესს.
export default function DeleteUserButton({ userId, email, businesses }: { userId: string; email: string; businesses: BusinessFate[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const remove = async () => {
        if (typed.trim().toLowerCase() !== email.toLowerCase()) { setError("ზუსტად აკრიფეთ მომხმარებლის ელფოსტა."); return; }
        if (!code) { setError("შეიყვანეთ კოდი აპიდან."); return; }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/users/${userId}/delete`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmEmail: typed, code }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "ვერ წაიშალა.");
            setOpen(false);
            router.replace(`/admin/users?deleted=1`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ვერ წაიშალა.");
        } finally { setBusy(false); }
    };

    const deleting = businesses.filter(business => business.fate === "delete");

    return <>
        <button type="button" onClick={() => { setTyped(""); setCode(""); setError(""); setOpen(true); }}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-danger/30 px-3 text-left text-sm font-medium text-danger transition hover:bg-danger/10">
            <Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5 shrink-0" aria-hidden="true" />ანგარიშის წაშლა
        </button>
        <ConfirmDialog open={open} danger title="ანგარიშის სამუდამოდ წაშლა" confirmLabel="სამუდამოდ წაშლა" cancelLabel="დატოვება" busy={busy} error={error}
            onConfirm={() => void remove()} onClose={() => { if (!busy) setOpen(false); }}>
            <span className="block">წაიშლება სახელი, ელფოსტა, ტელეფონი, ფოტო, სესიები და შეტყობინებები. ამის დაბრუნება შეუძლებელია.</span>
            {businesses.length > 0 && <ul className="mt-3 flex flex-col gap-1.5 rounded-xl bg-background p-3 text-sm">
                {businesses.map(business => <li key={business.id} className="flex items-start gap-2">
                    <Icon icon={business.fate === "delete" ? "solar:trash-bin-trash-linear" : "solar:logout-2-linear"} className={`mt-0.5 h-4 w-4 shrink-0 ${business.fate === "delete" ? "text-danger" : "text-text-secondary"}`} aria-hidden="true" />
                    <span className="text-text-primary">„{business.name}“ <span className="text-text-secondary">
                        {business.fate === "delete"
                            ? `· წაიშლება ყველა მონაცემით${business.otherMembers ? ` (${business.otherMembers} წევრი შეტყობინებას მიიღებს)` : ""}`
                            : business.role === "OWNER" ? "· თანამფლობელობიდან გავა, ბიზნესი დარჩება" : "· გუნდიდან გავა, ბიზნესი დარჩება"}
                    </span></span>
                </li>)}
            </ul>}
            {deleting.length > 0 && <span className="mt-2 block text-xs text-danger">{deleting.length} ბიზნესი წაიშლება შეკვეთებით, კლიენტებით და მარაგით.</span>}
            <label className="mt-3 block text-xs text-text-secondary">დასადასტურებლად აკრიფეთ ელფოსტა: <b className="font-medium text-text-primary">{email}</b>
                <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" spellCheck={false}
                    className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-danger sm:text-sm" />
            </label>
            <AdminCodeField value={code} onChange={setCode} />
        </ConfirmDialog>
    </>;
}
