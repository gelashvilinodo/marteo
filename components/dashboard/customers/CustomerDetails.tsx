"use client";

import { Icon } from "@iconify/react";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";
import CustomerDeleteButton from "./CustomerDeleteButton";

export function formatDate(value: string | null) {
    if (!value) return "-";

    const timestamp = Date.parse(value);

    if (Number.isNaN(timestamp)) return "-";

    // თარიღი თბილისის დროით — სერვერსა და ბრაუზერში ერთნაირად.
    const tbilisiDate = new Date(timestamp + 4 * 60 * 60 * 1000);

    const day = String(tbilisiDate.getUTCDate()).padStart(2, "0");
    const month = String(tbilisiDate.getUTCMonth() + 1).padStart(2, "0");
    const year = tbilisiDate.getUTCFullYear();

    return `${day}.${month}.${year}`;
}

// მომხმარებლის ინფორმაცია — მომხმარებლების გვერდზე და მართეო AI-ში.
export default function CustomerDetails({
    customer,
    onClose,
    onEdit,
    onSuccess,
}: {
    customer: CustomerEntry;
    onClose: () => void;
    onEdit: (customer: CustomerEntry) => void;
    onSuccess: (message: string) => void;
}) {
    return (
        <>
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">
                    მომხმარებლის ინფორმაცია
                </h2>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="დახურვა"
                    className={
                        "flex h-10 w-10 items-center " +
                        "justify-center rounded-xl " +
                        "border border-border"
                    }
                >
                    <Icon
                        icon="solar:close-circle-linear"
                        className="h-6 w-6"
                    />
                </button>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
                {[
                    ["სახელი", customer.firstName],
                    ["გვარი", customer.lastName],
                    ["ტელეფონი", customer.phone],
                    ["მისამართი", customer.address],
                    [
                        "დასრულებული შეკვეთები",
                        String(customer.completedOrders),
                    ],
                    [
                        "ბოლო დასრულებული",
                        formatDate(customer.lastOrderAt),
                    ],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-text-secondary">
                            {label}
                        </dt>
                        <dd className="mt-1 break-words">
                            {value || "-"}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                    type="button"
                    onClick={() => onEdit(customer)}
                    className={
                        "inline-flex items-center gap-2 rounded-xl " +
                        "border border-border px-4 py-3 text-sm " +
                        "transition hover:border-accent hover:text-accent"
                    }
                >
                    <Icon
                        icon="solar:pen-linear"
                        className="h-5 w-5"
                    />

                    რედაქტირება
                </button>
                <CustomerDeleteButton
                    key={customer.id}
                    ids={[customer.id]}
                    onDeleted={onClose}
                    onSuccess={onSuccess}
                />
            </div>
        </>
    );
}
