"use client";

import { Icon } from "@iconify/react";
import { useNewOrder } from "./NewOrderProvider";

type NewOrderButtonProps = {
    label?: string;
    className?: string;
};

export default function NewOrderButton({
    label = "ახალი შეკვეთა",
    className = "",
}: NewOrderButtonProps) {
    const { openNewOrder } = useNewOrder();

    return (
        <button
            type="button"
            onClick={openNewOrder}
            className={[
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90",
                className,
            ].join(" ")}
        >
            <Icon
                icon="solar:add-circle-bold"
                className="h-5 w-5"
            />

            {label}
        </button>
    );
}