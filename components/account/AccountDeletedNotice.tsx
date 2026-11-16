"use client";

import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

// მთავარ გვერდზე ანგარიშის წაშლის შემდეგ (?account=deleted).
export default function AccountDeletedNotice() {
    const params = useSearchParams();
    const [hidden, setHidden] = useState(false);
    if (hidden || params.get("account") !== "deleted") return null;
    return <div role="status" className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-text-primary shadow-2xl">
        <Icon icon="solar:check-circle-bold" className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <p className="min-w-0 flex-1">თქვენი ანგარიში წაიშალა. დადასტურება ელფოსტაზე გამოგიგზავნეთ. მადლობა, რომ მართეოთი სარგებლობდით.</p>
        <button type="button" onClick={() => setHidden(true)} aria-label="დახურვა" className="-m-1 rounded-lg p-1 text-text-secondary transition hover:bg-background">
            <Icon icon="solar:close-circle-linear" className="size-5" aria-hidden="true" />
        </button>
    </div>;
}
