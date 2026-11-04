"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// შეუქცევადი წაშლა: დადასტურებისთვის ბიზნესის სახელი ზუსტად უნდა აიკრიფოს.
export default function DeleteBusinessButton({ businessId, name }: { businessId: string; name: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const remove = async () => {
        if (typed.trim() !== name.trim()) { setError("ზუსტად აკრიფე ბიზნესის სახელი."); return; }
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/businesses/${businessId}`, {
                method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmName: typed }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "ვერ წაიშალა.");
            setOpen(false);
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ვერ წაიშალა.");
        } finally { setBusy(false); }
    };

    return <>
        <button type="button" onClick={() => { setTyped(""); setError(""); setOpen(true); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-danger px-3 text-xs font-semibold text-white transition hover:opacity-90">
            <Icon icon="solar:trash-bin-trash-bold" className="h-4 w-4" aria-hidden="true" />წაშლა
        </button>
        <ConfirmDialog open={open} danger title="ბიზნესის წაშლა" confirmLabel="სამუდამოდ წაშლა" cancelLabel="დატოვება" busy={busy} error={error}
            onConfirm={() => void remove()} onClose={() => { if (!busy) setOpen(false); }}>
            <span className="block">„{name}“ და მისი ყველა მონაცემი (შეკვეთები, მომხმარებლები, მარაგი, ფოტოები) სამუდამოდ წაიშლება. ამის დაბრუნება შეუძლებელია.</span>
            <label className="mt-3 block text-xs text-text-secondary">დასადასტურებლად აკრიფე ბიზნესის სახელი
                <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off"
                    className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-danger sm:text-sm" />
            </label>
        </ConfirmDialog>
    </>;
}
