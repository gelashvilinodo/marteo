"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import OrdersPagination from "@/components/dashboard/orders/OrdersPagination";
import type {
    FinancialMovement,
    FinancialMovementsData,
} from "@/lib/analytics/get-financial-movements";

const kinds: Record<string, string> = {
    SALE: "გაყიდვა",
    RETURN: "გაყიდვის დაბრუნება",
    EXCHANGE_ADJUSTMENT: "გადაცვლის შესწორება",
    COST_ADJUSTMENT: "თვითღირებულების შესწორება",
    PAYMENT: "თანხის მიღება",
    REFUND: "თანხის დაბრუნება",
    ADVERTISING: "რეკლამა",
    RENT: "ქირა",
    SALARY: "ხელფასი",
    TAX: "გადასახადი",
    UTILITIES: "კომუნალური",
    SOFTWARE: "პროგრამული მომსახურება",
    PACKAGING: "შეფუთვა",
    TRANSPORT: "ტრანსპორტი",
    COMMISSION: "საკომისიო",
    OTHER: "სხვა ხარჯი",
};

const methods: Record<string, string> = {
    CASH: "ნაღდი",
    BANK_TRANSFER: "გადარიცხვა",
    CARD: "ბარათი",
};

function date(value: string) {
    const d = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
    const pad = (part: number) => String(part).padStart(2, "0");

    return (
        `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.` +
        `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
    );
}

function description(row: FinancialMovement) {
    if (row.source === "payment") {
        return methods[row.title] ?? row.title;
    }

    if (row.source === "expense") {
        return row.title;
    }

    return "გაყიდვის თანხის ცვლილება";
}

export default function FinancialMovements({
    data,
}: {
    data: FinancialMovementsData;
}) {
    const router = useRouter();
    const params = useSearchParams();
    const [pending, startTransition] = useTransition();

    function navigate(values: Record<string, string>) {
        const next = new URLSearchParams(params.toString());

        for (const [key, value] of Object.entries(values)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }

        startTransition(() => {
            router.push(`/dashboard/analytics?${next.toString()}`, {
                scroll: false,
            });
        });
    }

    return (
        <section
            id="orders-list"
            aria-busy={pending}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface scroll-mt-24"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon
                        icon="solar:bill-list-linear"
                        className="h-5 w-5 text-accent"
                    />
                    ფინანსური მოძრაობები
                    <span className="text-sm font-normal text-text-secondary">
                        {data.total}
                    </span>
                </h2>

                <select
                    aria-label="ფინანსური მოძრაობის ტიპი"
                    value={data.source}
                    disabled={pending}
                    onChange={event =>
                        navigate({
                            movement: event.target.value,
                            page: "",
                        })
                    }
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary sm:w-auto"
                >
                    <option value="all">ყველა მოძრაობა</option>
                    <option value="financial">გაყიდვები და შესწორებები</option>
                    <option value="payment">გადახდები და თანხის დაბრუნება</option>
                    <option value="expense">ხარჯები</option>
                </select>
            </div>

            <p className="px-4 pb-4 text-xs text-text-secondary">
                გაყიდვა და თანხის მიღება სხვადასხვა ჩანაწერია.
                ამ სიის თანხები საერთო ჯამად არ იკრიბება.
            </p>

            {pending ? (
                <div role="status" aria-label="მოძრაობები იტვირთება">
                    <span className="sr-only">მოძრაობები იტვირთება</span>
                    {Array.from({ length: 5 }, (_, index) => (
                        <div
                            key={index}
                            className="flex h-20 items-center gap-4 border-t border-border px-4"
                        >
                            <div className="h-4 w-24 animate-pulse rounded bg-text-secondary/10" />
                            <div className="h-4 flex-1 animate-pulse rounded bg-text-secondary/10" />
                            <div className="h-4 w-20 animate-pulse rounded bg-text-secondary/10" />
                        </div>
                    ))}
                </div>
            ) : (
                <table className="w-full table-fixed text-left text-sm">
                    <thead className="bg-background text-xs text-text-secondary">
                        <tr>
                            <th className="w-28 px-3 py-3">თარიღი</th>
                            <th className="px-3 py-3">მოძრაობა</th>
                            <th className="hidden w-24 px-3 py-3 md:table-cell">
                                შეკვეთა
                            </th>
                            <th className="w-28 px-3 py-3 text-right">თანხა</th>
                            <th className="hidden w-36 px-3 py-3 text-right md:table-cell">
                                თვითღირებულება
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {data.rows.map(row => (
                            <tr
                                key={row.key}
                                className="border-t border-border"
                            >
                                <td className="px-3 py-4 text-xs text-text-secondary">
                                    {date(row.occurredAt)}
                                </td>

                                <td className="px-3 py-4">
                                    <p className="break-words font-medium text-text-primary">
                                        {kinds[row.kind] ?? row.kind}
                                    </p>
                                    <p className="mt-1 break-words text-xs text-text-secondary">
                                        {description(row)}
                                    </p>
                                    {row.orderNumber !== null && (
                                        <p className="mt-1 text-xs text-text-secondary md:hidden">
                                            #{String(row.orderNumber).padStart(4, "0")}
                                        </p>
                                    )}
                                </td>

                                <td className="hidden px-3 py-4 text-text-secondary md:table-cell">
                                    {row.orderNumber === null
                                        ? "—"
                                        : `#${String(row.orderNumber).padStart(4, "0")}`}
                                </td>

                                <td className="px-3 py-4 text-right font-semibold tabular-nums text-text-primary">
                                    {row.amount} ₾
                                </td>

                                <td className="hidden px-3 py-4 text-right text-xs tabular-nums text-text-secondary md:table-cell">
                                    {!row.costComplete
                                        ? "დასაზუსტებელია"
                                        : row.cost === null
                                            ? "—"
                                            : `${row.cost} ₾`}
                                </td>
                            </tr>
                        ))}

                        {data.rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="p-8 text-center text-text-secondary"
                                >
                                    არჩეულ პერიოდში მოძრაობები არ მოიძებნა.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}

            <OrdersPagination
                currentPage={data.page}
                totalPages={data.pages}
                onPageChange={page => navigate({ page: String(page) })}
            />
        </section>
    );
}