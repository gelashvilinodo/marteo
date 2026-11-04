"use client";
import { useBusinessAccess } from "@/components/dashboard/business/BusinessAccessContext";

import { Icon } from "@iconify/react";
import { useNewOrder } from "./NewOrderProvider";

export default function NewOrderButton({
    className = "",
    tourId,
}: {
    className?: string;
    tourId?: string;
}) {
    const { openNewOrder } = useNewOrder();
    const { can } = useBusinessAccess();
    if (!can("ORDERS", "edit")) return null;

    return (
        <button
            type="button"
            data-tour={tourId}
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