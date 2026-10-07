"use client";

import { Icon } from "@iconify/react";

import type {
    InventoryCondition,
    InventoryMovementType,
} from "@/generated/prisma/client";

export type InventoryMovementEntry = {
    id: string;
    type: InventoryMovementType;
    condition: InventoryCondition;
    quantity: number;
    createdAt: string;
    name: string;
    color: string | null;
    size: string | null;
};

const movementTypes: Record<
    InventoryMovementType,
    { label: string; incoming: boolean }
> = {
    PURCHASE_IN: {
        label: "მარაგის მიღება",
        incoming: true,
    },
    SALE_OUT: {
        label: "გაყიდვა",
        incoming: false,
    },
    CUSTOMER_RETURN_IN: {
        label: "მომხმარებლის დაბრუნება",
        incoming: true,
    },
    SUPPLIER_RETURN_OUT: {
        label: "მომწოდებელთან დაბრუნება",
        incoming: false,
    },
    ADJUSTMENT_IN: {
        label: "მარაგის დამატება",
        incoming: true,
    },
    ADJUSTMENT_OUT: {
        label: "მარაგის შემცირება",
        incoming: false,
    },
};

function formatQuantity(value: number) {
    return String(Math.abs(value)).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        " ",
    );
}

function formatDate(value: string) {
    // თბილისის დრო: UTC + 4.
    // სერვერზე და ბრაუზერში ერთნაირი შედეგი იქნება.
    const date = new Date(
        new Date(value).getTime() + 4 * 60 * 60 * 1000,
    );

    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");

    return `${day}.${month}.${year} · ${hour}:${minute}`;
}

export default function LatestInventoryMovements({
    movements,
}: {
    movements: InventoryMovementEntry[];
}) {
    return (
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex items-center gap-2">
                <Icon
                    icon="solar:transfer-horizontal-linear"
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-accent"
                />

                <h2 className="text-lg font-semibold text-text-primary">
                    უახლესი მოძრაობები
                </h2>
            </div>

            {movements.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <Icon
                        icon="solar:history-linear"
                        aria-hidden="true"
                        className="h-8 w-8 text-text-secondary"
                    />

                    <p className="text-sm text-text-secondary">
                        მარაგის მოძრაობები ჯერ არ არის.
                    </p>
                </div>
            ) : (
                <ul className="mt-3 divide-y divide-border">
                    {movements.map((movement) => {
                        const metadata = movementTypes[movement.type];
                        const defective = movement.condition === "DEFECTIVE";

                        const color = metadata.incoming
                            ? defective
                                ? "bg-accent/10 text-accent"
                                : "bg-success/10 text-success"
                            : "bg-danger/10 text-danger";

                        const variant = [
                            movement.color,
                            movement.size,
                        ]
                            .filter(Boolean)
                            .join(" · ");

                        return (
                            <li
                                key={movement.id}
                                className="flex min-w-0 items-start gap-2.5 py-3"
                            >
                                <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${color}`}
                                >
                                    <Icon
                                        icon={
                                            metadata.incoming
                                                ? "solar:arrow-down-linear"
                                                : "solar:arrow-up-linear"
                                        }
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                </span>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 text-xs font-semibold text-text-primary">
                                            {metadata.label}
                                        </p>

                                        <span
                                            aria-label={
                                                `${metadata.incoming ? "დაემატა" : "გამოაკლდა"} ${formatQuantity(movement.quantity)} პროდუქტი`
                                            }
                                            className={[
                                                "shrink-0 text-sm font-semibold tabular-nums",
                                                metadata.incoming
                                                    ? defective
                                                        ? "text-accent"
                                                        : "text-success"
                                                    : "text-danger",
                                            ].join(" ")}
                                        >
                                            {metadata.incoming ? "+" : "−"}
                                            {formatQuantity(movement.quantity)}
                                        </span>
                                    </div>

                                    <p
                                        title={movement.name}
                                        className="mt-1 truncate text-sm text-text-primary"
                                    >
                                        {movement.name}
                                    </p>

                                    {variant && (
                                        <p className="mt-0.5 break-words text-xs text-text-secondary">
                                            {variant}
                                        </p>
                                    )}

                                    {defective && (
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                                            <Icon
                                                icon="solar:shield-warning-linear"
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                            />
                                            წუნდებული
                                        </span>
                                    )}

                                    <time
                                        dateTime={movement.createdAt}
                                        className="mt-1.5 block text-[11px] tabular-nums text-text-secondary"
                                    >
                                        {formatDate(movement.createdAt)}
                                    </time>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}