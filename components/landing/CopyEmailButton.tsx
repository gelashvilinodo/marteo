"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

export default function CopyEmailButton({ email }: { email: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(email);
            setCopied(true);
        } catch {
            // ბუფერზე წვდომა თუ არ არის, ელფოსტა გვერდზე მაინც ჩანს და ხელით მოინიშნება.
        }
    }

    return (
        <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent sm:w-auto"
        >
            <Icon icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"} className="h-4 w-4" />
            <span aria-live="polite">{copied ? "დაკოპირდა" : "კოპირება"}</span>
        </button>
    );
}
