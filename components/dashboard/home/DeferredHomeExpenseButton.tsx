"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const ExpenseButton = dynamic(
    () => import("@/components/dashboard/analytics/NewExpenseButton"),
    {
        ssr: false,
        loading: () => (
            <span
                role="status"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm text-text-secondary"
            >
                იტვირთება…
            </span>
        ),
    },
);

export default function DeferredHomeExpenseButton({
    businessId,
}: {
    businessId: string;
}) {
    const [activated, setActivated] = useState(false);

    if (activated) {
        return (
            <ExpenseButton
                businessId={businessId}
                autoOpen
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => setActivated(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white transition-colors hover:bg-success-hover"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="M9 8h6M9 12h6M9 16h3" />
            </svg>

            ხარჯის დამატება
        </button>
    );
}