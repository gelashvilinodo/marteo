"use client";
import { refreshAnalyticsAfterMutation } from "@/lib/analytics/refresh-analytics-client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import OrdersPagination from "@/components/dashboard/orders/OrdersPagination";
import type {
    FinancialMovement,
    FinancialMovementsData,
} from "@/lib/analytics/get-financial-movements";
import MovementActions from "./MovementActions";

const kinds: Record<string, string> = {
    PURCHASE: "პარტიის შეძენა",
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
    ORDER_SUMMARY: "შეკვეთის ფინანსები",
    INVENTORY_WRITE_OFF: "მარაგის ჩამოწერა",
};

const methods: Record<string, string> = {
    UNKNOWN: "მეთოდი უცნობია",
    CASH: "ნაღდი",
    BANK_TRANSFER: "გადარიცხვა",
    CARD: "ბარათი",
};

function date(value: string) {
    const d = new Date(
        new Date(value).getTime() + 4 * 60 * 60 * 1000,
    );

    const pad = (part: number) => String(part).padStart(2, "0");

    return (
        `${pad(d.getUTCDate())}.` +
        `${pad(d.getUTCMonth() + 1)}.` +
        `${d.getUTCFullYear()}`
    );
}

function description(row: FinancialMovement) {
    if (row.kind === "ORDER_SUMMARY") {
        return row.title;
    }
    if (row.source === "payment") {
        return methods[row.title] ?? row.title;
    }

    if (
        row.source === "expense" ||
        row.source === "purchase" ||
        row.source === "writeoff"
    ) {
        return row.title;
    }

    return "გაყიდვის თანხის ცვლილება";
}

function movementStyle(row: FinancialMovement) {
    if (row.source === "writeoff") {
        return {
            label: "მარაგის ჩამოწერა",
            icon: "solar:box-linear",
            row: "bg-danger/[0.06]",
            badge: "bg-danger/10 text-danger",
        };
    }
    if (row.source === "purchase") {
        return {
            label: "შესყიდვა",
            icon: "solar:cart-large-2-linear",
            row: "bg-warning/[0.06]",
            badge: "bg-warning/10 text-warning",
        };
    }

    if (row.source === "expense") {
        return {
            label: "ხელით დამატებული",
            icon: "solar:pen-linear",
            row: "bg-violet-400/[0.06]",
            badge: "bg-violet-400/10 text-violet-400",
        };
    }

    return {
        label: "შეკვეთა",
        icon: "solar:clipboard-list-linear",
        row: "bg-success/[0.06]",
        badge: "bg-success/10 text-success",
    };
}

function MovementSource({ row }: { row: FinancialMovement }) {
    const style = movementStyle(row);

    return (
        <div className="space-y-1.5">
            <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${style.badge}`}
            >
                <Icon
                    icon={style.icon}
                    className="h-4 w-4 shrink-0"
                />
                <span>{style.label}</span>
            </span>

            {row.orderNumber !== null && (
                <p className="text-xs tabular-nums text-text-secondary">
                    #{String(row.orderNumber).padStart(4, "0")}
                </p>
            )}
        </div>
    );
}

function isMovementData(value: unknown): value is FinancialMovementsData {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const data = value as Record<string, unknown>;
    const sources = [
        "all",
        "financial",
        "payment",
        "expense",
        "purchase",
        "writeoff",
    ];

    return (
        typeof data.source === "string" &&
        sources.includes(data.source) &&
        typeof data.total === "number" &&
        Number.isSafeInteger(data.total) &&
        data.total >= 0 &&
        typeof data.page === "number" &&
        Number.isSafeInteger(data.page) &&
        data.page >= 1 &&
        typeof data.pages === "number" &&
        Number.isSafeInteger(data.pages) &&
        data.pages >= data.page &&
        Array.isArray(data.rows) &&
        data.rows.length <= 20 &&
        data.rows.every(value => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                return false;
            }

            const row = value as Record<string, unknown>;

            return (
                typeof row.key === "string" &&
                typeof row.source === "string" &&
                ["financial", "payment", "expense", "purchase", "writeoff"].includes(
                    row.source,
                ) &&
                typeof row.kind === "string" &&
                typeof row.occurredAt === "string" &&
                Number.isFinite(new Date(row.occurredAt).getTime()) &&
                (row.orderNumber === null ||
                    (typeof row.orderNumber === "number" &&
                        Number.isSafeInteger(row.orderNumber))) &&
                typeof row.title === "string" &&
                typeof row.amount === "string" &&
                /^-?\d+\.\d{2}$/.test(row.amount) &&
                (row.cost === null ||
                    (typeof row.cost === "string" &&
                        /^-?\d+\.\d{2}$/.test(row.cost))) &&
                typeof row.costComplete === "boolean"
            );
        })
    );
}

export default function FinancialMovements({
    data,
    externalRefreshing = false,
}: {
    data: FinancialMovementsData;
    externalRefreshing?: boolean;
}) {
    const router = useRouter();
    const params = useSearchParams();
    const [refreshing, startTransition] = useTransition();
    const [listData, setListData] = useState(data);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState("");

    const listRequest = useRef<AbortController | null>(null);
    const lastValues = useRef<Record<string, string>>({});

    const pending = refreshing || listLoading || externalRefreshing;

    useEffect(() => {
        listRequest.current?.abort();
        listRequest.current = null;
        setListData(data);
        setListLoading(false);
        setListError("");

        return () => listRequest.current?.abort();
    }, [data]);
    useEffect(() => {
        if (externalRefreshing) {
            listRequest.current?.abort();
        }
    }, [externalRefreshing]);
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (!notice) return;

        const timer = window.setTimeout(() => setNotice(""), 2000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    function actionDone(message: string) {
        setNotice(message);

        startTransition(() => {
            refreshAnalyticsAfterMutation(() => router.refresh());
        });
    }

    async function navigate(values: Record<string, string>) {
        listRequest.current?.abort();

        const controller = new AbortController();
        listRequest.current = controller;
        lastValues.current = values;

        const next = new URLSearchParams(params.toString());

        for (const [key, value] of Object.entries(values)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }

        setListLoading(true);
        setListError("");

        try {
            const response = await fetch(
                `/api/analytics/movements?${next.toString()}`,
                {
                    cache: "no-store",
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            const result: unknown = await response.json();
            const body =
                result !== null &&
                    typeof result === "object" &&
                    !Array.isArray(result)
                    ? (result as Record<string, unknown>)
                    : null;

            if (
                !response.ok ||
                body?.success !== true ||
                !isMovementData(body.data)
            ) {
                throw new Error(
                    typeof body?.message === "string"
                        ? body.message
                        : "მოძრაობები ვერ ჩაიტვირთა.",
                );
            }

            if (controller.signal.aborted) return;

            setListData(body.data);

            // შეინარჩუნე API-ს მიერ გასწორებული გვერდი და ფილტრი.
            next.set("page", String(body.data.page));
            next.set("movement", body.data.source);

            window.history.replaceState(
                null,
                "",
                `/dashboard/analytics?${next.toString()}${window.location.hash}`,
            );
        } catch (cause: unknown) {
            if (!controller.signal.aborted) {
                setListError(
                    cause instanceof Error
                        ? cause.message
                        : "მოძრაობები ვერ ჩაიტვირთა.",
                );
            }
        } finally {
            if (listRequest.current === controller) {
                listRequest.current = null;
                setListLoading(false);
            }
        }
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
                        {listData.total}
                    </span>
                </h2>

                <select
                    aria-label="ფინანსური მოძრაობის ტიპი"
                    value={listData.source}
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
                    <option value="purchase">შესყიდვები</option>
                    <option value="expense">ხელით დამატებული ხარჯები</option>
                    <option value="writeoff">მარაგის ჩამოწერა</option>
                </select>
            </div>

            <p className="px-4 pb-4 text-xs text-text-secondary">
                გაყიდვა და თანხის მიღება სხვადასხვა ჩანაწერია.
                ამ სიის თანხები საერთო ჯამად არ იკრიბება.
            </p>

            {listError && (
                <div
                    role="alert"
                    className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3"
                >
                    <p className="text-sm text-red-400">{listError}</p>

                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => void navigate(lastValues.current)}
                        className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                    >
                        ხელახლა ცდა
                    </button>
                </div>
            )}

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
                <>
                    <div className="md:hidden">
                        {listData.rows.map(row => (
                            <article
                                key={row.key}
                                className={`min-w-0 space-y-3 border-t border-border p-4 ${movementStyle(row).row}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-text-primary">
                                        {kinds[row.kind] ?? row.kind}
                                    </h3>

                                    <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-text-primary">
                                        {row.amount} ₾
                                    </p>
                                </div>

                                <p className="break-words text-xs text-text-secondary">
                                    {description(row)}
                                </p>

                                <p className="text-xs tabular-nums text-text-secondary">
                                    {date(row.occurredAt)}
                                </p>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <MovementSource row={row} />
                                    </div>

                                    <div className="shrink-0">
                                        <MovementActions
                                            row={row}
                                            title={kinds[row.kind] ?? row.kind}
                                            dateLabel={date(row.occurredAt)}
                                            onDone={actionDone}
                                        />
                                    </div>
                                </div>
                            </article>
                        ))}

                        {data.rows.length === 0 && (
                            <p className="border-t border-border p-6 text-center text-sm text-text-secondary">
                                არჩეულ პერიოდში მოძრაობები არ მოიძებნა.
                            </p>
                        )}
                    </div>

                    <table className="hidden w-full table-fixed text-left text-sm md:table">
                        <thead className="bg-background text-xs text-text-secondary">
                            <tr>
                                <th className="w-28 px-3 py-3">თარიღი</th>
                                <th className="px-3 py-3">მოძრაობა</th>
                                <th className="hidden w-40 px-3 py-3 md:table-cell">
                                    წყარო
                                </th>
                                <th className="w-28 px-3 py-3 text-right">თანხა</th>
                                <th className="hidden w-36 px-3 py-3 text-right md:table-cell">
                                    თვითღირებულება
                                </th>
                                <th className="w-14 px-2 py-3">
                                    <span className="sr-only">მოქმედებები</span>
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {data.rows.map(row => (
                                <tr
                                    key={row.key}
                                    className={`border-t border-border ${movementStyle(row).row}`}
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
                                        <div className="mt-2 md:hidden">
                                            <MovementSource row={row} />
                                        </div>
                                    </td>

                                    <td className="hidden px-3 py-4 align-middle md:table-cell">
                                        <MovementSource row={row} />
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
                                    <td className="px-2 py-4 text-right">
                                        <MovementActions
                                            row={row}
                                            title={kinds[row.kind] ?? row.kind}
                                            dateLabel={date(row.occurredAt)}
                                            onDone={actionDone}
                                        />
                                    </td>
                                </tr>
                            ))}

                            {data.rows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="p-8 text-center text-text-secondary"
                                    >
                                        არჩეულ პერიოდში მოძრაობები არ მოიძებნა.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </>
            )}

            <OrdersPagination
                currentPage={listData.page}
                totalPages={listData.pages}
                onPageChange={page => navigate({ page: String(page) })}
            />
            {notice &&
                createPortal(
                    <div
                        role="status"
                        className="fixed bottom-4 right-4 z-[1000] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 text-text-primary shadow-xl"
                    >
                        <Icon
                            icon="solar:check-circle-linear"
                            className="h-5 w-5 shrink-0 text-success"
                        />
                        <span className="text-sm">{notice}</span>

                        <button
                            type="button"
                            aria-label="შეტყობინების დახურვა"
                            onClick={() => setNotice("")}
                            className="shrink-0 text-text-secondary"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-5 w-5"
                            />
                        </button>
                    </div>,
                    document.body,
                )}
        </section>
    );
}