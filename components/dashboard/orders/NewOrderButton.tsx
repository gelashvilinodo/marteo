"use client";

import { Icon } from "@iconify/react";
import { useNewOrder } from "./NewOrderProvider";

export default function NewOrderButton({
    className = "",
}: {
    className?: string;
}) {
    const { openNewOrder } = useNewOrder();

    return (
        <button
            type="button"
            onClick={openNewOrder}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-5 text-sm font-semibold text-white transition-colors hover:bg-success-hover ${className}`}
        >
            <Icon
                icon="solar:add-circle-linear"
                className="h-5 w-5 shrink-0"
            />
            ახალი შეკვეთა
        </button>
    );
}