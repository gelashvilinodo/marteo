"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import AdminCodeField from "./AdminCodeField";

// ახალი ადმინის მოწვევა ელფოსტით. ადმინ პანელი ყველაფერს ხედავს, ამიტომ კოდი აპიდანაც საჭიროა.
export default function AdminInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [sentTo, setSentTo] = useState("");

    const close = () => {
        if (busy) return;
        setEmail(""); setCode(""); setError(""); setSentTo("");
        onClose();
    };

    const send = async () => {
        if (sentTo) { close(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("ჩაწერე სწორი ელფოსტა."); return; }
        if (!code) { setError("შეიყვანე კოდი აპიდან."); return; }
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/admin/team/invites", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), code }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "მოწვევა ვერ გაიგზავნა.");
            setSentTo(email.trim().toLowerCase());
            router.refresh();
        } catch (cause) {
            setCode("");
            setError(cause instanceof Error ? cause.message : "მოწვევა ვერ გაიგზავნა.");
        } finally { setBusy(false); }
    };

    return <ConfirmDialog open={open} title="ადმინის დამატება" confirmLabel={sentTo ? "კარგი" : "მოწვევის გაგზავნა"} cancelLabel={sentTo ? "დახურვა" : "გაუქმება"}
        busy={busy} error={error} onConfirm={() => void send()} onClose={close}>
        {sentTo ? <span className="block">მოწვევა გაიგზავნა: <b className="font-medium text-text-primary">{sentTo}</b>. ბმული 48 საათი მოქმედებს. მიღების შემდეგ ახალი ადმინი ორეტაპიან შესვლას ჩართავს და ადმინ პანელში შევა.</span> : <>
            <span className="block">ადმინი ხედავს ყველა ბიზნესს, მომხმარებელს და გადახდას. მოიწვიე მხოლოდ ის, ვისაც ენდობი. მოწვეულს MARTEO-ზე ანგარიში უნდა ჰქონდეს ამავე ელფოსტით.</span>
            <label className="mt-3 block text-xs text-text-secondary">ელფოსტა
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" spellCheck={false} placeholder="name@example.com"
                    className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm" />
            </label>
            <AdminCodeField value={code} onChange={setCode} />
        </>}
    </ConfirmDialog>;
}
