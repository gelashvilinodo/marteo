"use client";

import { Icon } from "@iconify/react";

export default function TourHelpButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="გვერდის გაცნობა"
            title="გვერდის გაცნობა"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-background hover:text-accent"
        >
            <Icon icon="solar:question-circle-linear" className="h-5 w-5" />
        </button>
    );
}
