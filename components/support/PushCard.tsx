"use client";

import { Icon } from "@iconify/react";
import PushToggle from "./PushToggle";

// The notifications page (header bell) is the permanent home of the switch.
export default function PushCard({ publicKey, description }: { publicKey: string | null; description: string }) {
    if (!publicKey) return null;
    return <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-start sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <Icon icon="solar:bell-bing-bold-duotone" className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">შეტყობინებები ამ მოწყობილობაზე</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
        </div>
        <div className="w-full sm:w-64 sm:shrink-0"><PushToggle publicKey={publicKey} tone="light" /></div>
    </section>;
}
