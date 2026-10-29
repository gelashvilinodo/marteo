"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OpenSupportChatButton({ businessId, conversationId }: { businessId: string; conversationId: string | null }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const open = async () => {
        if (conversationId) { router.push(`/admin/support/${conversationId}`); return; }
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/admin/support/conversations", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }),
            });
            const data = await response.json().catch(() => ({})) as { conversationId?: string; message?: string };
            if (!response.ok || !data.conversationId) throw new Error(data.message || "ჩათი ვერ გაიხსნა.");
            router.push(`/admin/support/${data.conversationId}`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ჩათი ვერ გაიხსნა.");
            setBusy(false);
        }
    };

    return <div>
        <button type="button" onClick={open} disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60 sm:w-auto">
            <Icon icon="solar:chat-round-dots-bold-duotone" className="h-5 w-5" aria-hidden="true" />
            {busy ? "იხსნება…" : conversationId ? "ჩათის გახსნა" : "ჩათის დაწყება"}
        </button>
        {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>;
}
