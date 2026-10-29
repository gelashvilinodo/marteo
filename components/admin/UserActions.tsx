"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

type Action = "verify-email" | "verify-phone" | "send-password-reset" | "end-sessions" | "suspend" | "unsuspend";

type UserActionsProps = {
    userId: string;
    email: string;
    phone: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    activeSessions: number;
    protectedAccount: boolean;
};

type Spec = { label: string; icon: string; title: string; description: string; confirm: string; danger?: boolean };

export default function UserActions(props: UserActionsProps) {
    const router = useRouter();
    const [pending, setPending] = useState<Action | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const specs: Partial<Record<Action, Spec>> = {};
    if (!props.emailVerified) specs["verify-email"] = { label: "ელფოსტის დადასტურება", icon: "solar:letter-opened-linear", title: "ელფოსტის ხელით დადასტურება", description: `${props.email} მონიშნება დადასტურებულად კოდის გარეშე. გააკეთე მხოლოდ მაშინ, თუ დარწმუნებული ხარ, რომ მეილი მისია.`, confirm: "დადასტურება" };
    if (!props.phoneVerified) specs["verify-phone"] = { label: "ტელეფონის დადასტურება", icon: "solar:smartphone-linear", title: "ტელეფონის ხელით დადასტურება", description: `${props.phone} მონიშნება დადასტურებულად SMS კოდის გარეშე. როცა ორივე დადასტურებულია, ანგარიში აქტიური ხდება.`, confirm: "დადასტურება" };
    if (props.status === "ACTIVE" && props.emailVerified) specs["send-password-reset"] = { label: "პაროლის აღდგენის ბმული", icon: "solar:key-linear", title: "პაროლის აღდგენის ბმულის გაგზავნა", description: `${props.email}-ზე გაიგზავნება ბმული, რომელიც 15 წუთი მოქმედებს. ძველი პაროლი იცვლება მხოლოდ მაშინ, როცა მომხმარებელი ახალს დააყენებს.`, confirm: "გაგზავნა" };
    if (!props.protectedAccount && props.activeSessions > 0) specs["end-sessions"] = { label: "ყველა მოწყობილობიდან გამოყვანა", icon: "solar:logout-3-linear", title: "ყველა მოწყობილობიდან გამოყვანა", description: `მომხმარებელი გავა ${props.activeSessions} მოწყობილობიდან და თავიდან შესვლა მოუწევს. ანგარიში აქტიური რჩება.`, confirm: "გამოყვანა", danger: true };
    if (!props.protectedAccount && props.status !== "SUSPENDED") specs.suspend = { label: "ანგარიშის შეჩერება", icon: "solar:lock-keyhole-minimalistic-linear", title: "ანგარიშის შეჩერება", description: "მომხმარებელი მაშინვე გავა ყველა მოწყობილობიდან და შესვლას ვეღარ შეძლებს, სანამ არ აღადგენ. მისი ბიზნესის მონაცემები არ იშლება.", confirm: "შეჩერება", danger: true };
    if (props.status === "SUSPENDED") specs.unsuspend = { label: "ანგარიშის აღდგენა", icon: "solar:lock-keyhole-unlocked-linear", title: "ანგარიშის აღდგენა", description: "მომხმარებელს ისევ შეეძლება შესვლა.", confirm: "აღდგენა" };

    const run = async () => {
        if (!pending) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/users/${props.userId}/actions`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: pending }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
            setNotice(data.message ?? "შესრულდა.");
            setPending(null);
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა.");
        } finally { setBusy(false); }
    };

    const entries = Object.entries(specs) as [Action, Spec][];
    const spec = pending ? specs[pending] : undefined;

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        {entries.length === 0
            ? <p className="text-sm text-text-secondary">{props.protectedAccount ? "პლატფორმის ადმინის ანგარიშზე მოქმედებები შეზღუდულია." : "ამ ანგარიშზე საჭირო მოქმედება არ არის."}</p>
            : <div className="grid gap-2 sm:grid-cols-2">
                {entries.map(([action, item]) => <button key={action} type="button" onClick={() => { setError(""); setNotice(""); setPending(action); }}
                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${item.danger ? "border-danger/30 text-danger hover:bg-danger/5" : "border-border text-text-primary hover:border-accent/40 hover:bg-background"}`}>
                    <Icon icon={item.icon} className="h-5 w-5 shrink-0" aria-hidden="true" />{item.label}
                </button>)}
            </div>}
        <ConfirmDialog open={Boolean(spec)} title={spec?.title ?? ""} confirmLabel={spec?.confirm ?? ""} danger={spec?.danger} busy={busy} error={error}
            onConfirm={run} onClose={() => { if (!busy) setPending(null); }}>
            {spec?.description}
        </ConfirmDialog>
    </div>;
}
