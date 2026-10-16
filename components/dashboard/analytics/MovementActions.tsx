"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { FinancialMovement } from "@/lib/analytics/get-financial-movements";
import ExpenseManageDialog from "./ExpenseManageDialog";

type RecordData = Record<string, unknown>;

function record(value: unknown): RecordData | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? (value as RecordData)
        : null;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function money(value: unknown): string {
    const amount = text(value);
    return amount ? `${amount} ₾` : "—";
}

const sourceLabels: Record<string, string> = {
    financial: "შეკვეთა",
    payment: "შეკვეთა",
    purchase: "შესყიდვა",
    expense: "ხელით დამატებული",
    writeoff: "მარაგის ჩამოწერა",
};

const methodLabels: Record<string, string> = {
    CASH: "ნაღდი",
    BANK_TRANSFER: "გადარიცხვა",
    CARD: "ბარათი",
};

const historyLabels: Record<string, string> = {
    SALE: "გაყიდვის აღრიცხვა",
    RETURN: "გაყიდვის დაბრუნება",
    EXCHANGE_ADJUSTMENT: "გადაცვლის შესწორება",
    COST_ADJUSTMENT: "თვითღირებულების შესწორება",
    PAYMENT: "თანხის მიღება",
    REFUND: "თანხის დაბრუნება",
};

function historyDate(value: unknown) {
    const date = new Date(text(value));

    if (!Number.isFinite(date.getTime())) return "—";

    const local = new Date(date.getTime() + 4 * 60 * 60 * 1000);
    const pad = (part: number) => String(part).padStart(2, "0");

    return (
        `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.` +
        `${local.getUTCFullYear()} ${pad(local.getUTCHours())}:` +
        `${pad(local.getUTCMinutes())}`
    );
}

function Field({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="min-w-0 rounded-xl border border-border bg-background p-3">
            <dt className="text-xs text-text-secondary">{label}</dt>
            <dd className="mt-1 break-words font-medium text-text-primary">
                {value || "—"}
            </dd>
        </div>
    );
}

export default function MovementActions({
    row,
    title,
    dateLabel,
    onDone,
}: {
    row: FinancialMovement;
    title: string;
    dateLabel: string;
    onDone: (message: string) => void;
}) {
    const menuId = useId();
    const menu = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);

    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<RecordData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [manage, setManage] = useState<"edit" | "delete" | null>(null);

    useEffect(() => {
        const element = menu.current;
        if (!element) return;

        function closeMenu(event: Event) {
            // თვითონ მენიუს შიგნით სქროლი დახურვას არ იწვევს.
            if (
                event.type === "scroll" &&
                event.target instanceof Node &&
                element!.contains(event.target)
            ) {
                return;
            }

            if (element!.matches(":popover-open")) {
                element!.hidePopover();
            }

            removeListeners();
        }

        function removeListeners() {
            window.removeEventListener("scroll", closeMenu, true);
            window.removeEventListener("resize", closeMenu);
        }

        function handleToggle() {
            removeListeners();

            if (element!.matches(":popover-open")) {
                window.addEventListener("scroll", closeMenu, {
                    capture: true,
                    passive: true,
                });
                window.addEventListener("resize", closeMenu);
            }
        }

        element.addEventListener("toggle", handleToggle);

        return () => {
            removeListeners();
            element.removeEventListener("toggle", handleToggle);
        };
    }, []);

    useEffect(() => {
        if (!open) return;

        dialog.current?.showModal();

        return () => {
            dialog.current?.close();
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        setDetail(null);
        setLoading(true);
        setError("");

        async function load() {
            try {
                const query = new URLSearchParams(window.location.search);
                query.set("key", row.key);
                const response = await fetch(
                    `/api/analytics/movements/details?${query.toString()}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                        signal: controller.signal,
                    },
                );

                const body = record(await response.json());
                const value = record(body?.detail);

                if (
                    !response.ok ||
                    body?.success !== true ||
                    !value ||
                    value.source !== row.source
                ) {
                    throw new Error(
                        text(body?.message) ||
                        "დეტალები ვერ ჩაიტვირთა.",
                    );
                }

                if (!controller.signal.aborted) {
                    setDetail(value);
                }
            } catch (cause: unknown) {
                if (!controller.signal.aborted) {
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : "დეტალები ვერ ჩაიტვირთა.",
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        void load();

        return () => controller.abort();
    }, [open, row.key, row.source, attempt]);

    const items = Array.isArray(detail?.items)
        ? detail.items
            .map(record)
            .filter((item): item is RecordData => item !== null)
        : [];

    const history = Array.isArray(detail?.history)
        ? detail.history
            .map(record)
            .filter((entry): entry is RecordData => entry !== null)
        : [];

    return (
        <>
            <button
                type="button"
                popoverTarget={row.source === "expense" ? menuId : undefined}
                aria-label={`${title}: მოქმედებები`}
                onClick={event => {
                    if (row.source !== "expense") {
                        setOpen(true);
                        return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    const width = 184;

                    setPosition({
                        left: Math.max(
                            8,
                            Math.min(
                                rect.right - width,
                                window.innerWidth - width - 8,
                            ),
                        ),
                        top:
                            rect.bottom + (row.source === "expense" ? 160 : 76) >
                                window.innerHeight
                                ? Math.max(
                                    8,
                                    rect.top - (row.source === "expense" ? 152 : 68),
                                )
                                : rect.bottom + 6,
                    });
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-text-secondary transition-colors hover:text-text-primary"
            >
                <Icon icon="solar:menu-dots-bold" className="h-5 w-5" />
            </button>

            <div
                id={menuId}
                ref={menu}
                popover="auto"
                style={{
                    position: "fixed",
                    inset: "auto",
                    top: position.top,
                    left: position.left,
                    margin: 0,
                }}
                className="w-[184px] rounded-xl border border-border bg-surface p-1.5 text-text-primary shadow-xl"
            >
                <button
                    type="button"
                    onClick={() => {
                        menu.current?.hidePopover();
                        setOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10"
                >
                    <Icon
                        icon="solar:document-text-linear"
                        className="h-5 w-5 text-accent"
                    />
                    დეტალები
                </button>
                {row.source === "expense" && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                menu.current?.hidePopover();
                                setManage("edit");
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10"
                        >
                            <Icon
                                icon="solar:pen-linear"
                                className="h-5 w-5 text-accent"
                            />
                            რედაქტირება
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                menu.current?.hidePopover();
                                setManage("delete");
                            }}
                            className="delete-action flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
                        >
                            <Icon
                                icon="solar:trash-bin-trash-linear"
                                className="h-5 w-5"
                            />
                            წაშლა
                        </button>
                    </>
                )}
            </div>

            <dialog
                ref={dialog}
                onCancel={() => setOpen(false)}
                onClose={() => setOpen(false)}
                aria-labelledby={`${menuId}-title`}
                className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary backdrop:bg-black/40 backdrop:backdrop-blur-sm text-left"
            >
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                    <h3
                        id={`${menuId}-title`}
                        className="flex items-center gap-2 font-semibold"
                    >
                        <Icon
                            icon="solar:document-text-linear"
                            className="h-5 w-5 shrink-0 text-accent"
                        />
                        მოძრაობის დეტალები
                    </h3>

                    <button
                        type="button"
                        aria-label="დახურვა"
                        onClick={() => setOpen(false)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
                    >
                        <Icon
                            icon="solar:close-circle-linear"
                            className="h-5 w-5"
                        />
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    <div>
                        <p className="font-semibold">{title}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                            {dateLabel}
                        </p>
                    </div>

                    {loading && (
                        <div
                            role="status"
                            className="flex items-center gap-2 py-6 text-sm text-text-secondary"
                        >
                            <Icon
                                icon="solar:refresh-linear"
                                className="h-5 w-5 animate-spin text-accent"
                            />
                            დეტალები იტვირთება
                        </div>
                    )}

                    {error && (
                        <div role="alert" className="space-y-3">
                            <p className="text-sm text-red-400">{error}</p>
                            <button
                                type="button"
                                onClick={() => setAttempt(value => value + 1)}
                                className="rounded-xl border border-border px-3 py-2 text-sm"
                            >
                                ხელახლა ცდა
                            </button>
                        </div>
                    )}

                    {detail && (
                        <>
                            <dl className="grid grid-cols-2 gap-3">
                                <Field
                                    label="წყარო"
                                    value={sourceLabels[row.source]}
                                />
                                {row.source !== "financial" && row.source !== "payment" && (
                                    <Field label="თანხა" value={money(detail.amount)} />
                                )}

                                {typeof detail.number === "number" && (
                                    <Field
                                        label={
                                            row.source === "purchase"
                                                ? "პარტიის ნომერი"
                                                : "შეკვეთის ნომერი"
                                        }
                                        value={`#${String(detail.number).padStart(4, "0")}`}
                                    />
                                )}

                                {(row.source === "expense" ||
                                    row.source === "purchase" ||
                                    row.source === "writeoff") && (
                                        <Field
                                            label="დასახელება"
                                            value={text(detail.title)}
                                        />
                                    )}

                                {row.source === "writeoff" && (
                                    <>
                                        <Field
                                            label="ჩამოწერილი რაოდენობა"
                                            value={String(detail.quantity ?? "—")}
                                        />
                                        <Field
                                            label="მათ შორის წუნდებული"
                                            value={String(detail.defectiveQuantity ?? "—")}
                                        />
                                        <Field
                                            label="ფერი"
                                            value={text(detail.color) || "—"}
                                        />
                                        <Field
                                            label="ზომა"
                                            value={text(detail.size) || "—"}
                                        />
                                    </>
                                )}

                                {row.source === "purchase" && (
                                    <>
                                        <Field
                                            label="პროდუქტები"
                                            value={money(detail.productsTotal)}
                                        />
                                        <Field
                                            label="ტრანსპორტირება"
                                            value={money(detail.shippingCost)}
                                        />
                                        <Field
                                            label="განბაჟება"
                                            value={money(detail.customsCost)}
                                        />
                                        <Field
                                            label="დამატებითი ხარჯი"
                                            value={money(detail.otherCost)}
                                        />
                                        {text(detail.supplierName) && (
                                            <Field
                                                label="მომწოდებელი"
                                                value={text(detail.supplierName)}
                                            />
                                        )}
                                    </>
                                )}
                                {(row.source === "financial" || row.source === "payment") && (
                                    <>
                                        <div className="col-span-2">
                                            <p className="text-xs text-text-secondary">
                                                არჩეული პერიოდი: {text(detail.from)} — {text(detail.to)}
                                            </p>
                                        </div>

                                        <Field
                                            label="მიღებული თანხა"
                                            value={money(detail.received)}
                                        />
                                        <Field
                                            label="დაბრუნებული თანხა"
                                            value={money(detail.refunded)}
                                        />
                                        <Field
                                            label="მიღებული მინუს დაბრუნებული"
                                            value={money(detail.netReceived)}
                                        />
                                        <Field
                                            label="აღრიცხული გაყიდვა"
                                            value={
                                                detail.hasSales === true
                                                    ? money(detail.sales)
                                                    : "ამ პერიოდში არ აღრიცხულა"
                                            }
                                        />

                                        {detail.hasSales === true && (
                                            <>
                                                <Field
                                                    label="პროდუქტების გაყიდვა"
                                                    value={money(detail.productRevenue)}
                                                />
                                                <Field
                                                    label="მიწოდების საფასური"
                                                    value={money(detail.deliveryRevenue)}
                                                />
                                                <Field
                                                    label="გაყიდული პროდუქტების ხარჯი"
                                                    value={
                                                        detail.costComplete === true
                                                            ? money(detail.cost)
                                                            : "თვითღირებულება არ არის მითითებული"
                                                    }
                                                />
                                                <Field
                                                    label="გაყიდვა მინუს თვითღირებულება"
                                                    value={
                                                        detail.costComplete === true
                                                            ? money(detail.profit)
                                                            : "ვერ გამოითვლება თვითღირებულების გარეშე"
                                                    }
                                                />
                                            </>
                                        )}
                                    </>
                                )}
                            </dl>

                            {history.length > 0 && (
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="text-sm font-semibold">
                                            შეკვეთის ფინანსური ისტორია
                                        </h4>
                                        <p className="mt-1 text-xs text-text-secondary">
                                            ყველა პერიოდის ჩანაწერები. ზემოთ თანხები მხოლოდ
                                            არჩეულ პერიოდს ასახავს.
                                        </p>
                                    </div>

                                    {history.map((entry, index) => (
                                        <div
                                            key={text(entry.id) || index}
                                            className="rounded-xl border border-border bg-background p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="min-w-0 break-words text-sm font-medium">
                                                    {historyLabels[text(entry.kind)] ??
                                                        text(entry.kind)}
                                                </p>
                                                <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">
                                                    {money(entry.amount)}
                                                </p>
                                            </div>

                                            <p className="mt-1 text-xs text-text-secondary">
                                                {historyDate(entry.occurredAt)}
                                                {text(entry.method) &&
                                                    ` · ${methodLabels[text(entry.method)] ??
                                                    text(entry.method)
                                                    }`}
                                                {text(entry.bankName) &&
                                                    ` · ${text(entry.bankName)}`}
                                            </p>

                                            {entry.cost !== null && (
                                                <p className="mt-1 text-xs text-text-secondary">
                                                    თვითღირებულების ცვლილება:{" "}
                                                    {entry.costComplete === true
                                                        ? money(entry.cost)
                                                        : "არ არის მითითებული"}
                                                </p>
                                            )}

                                            {entry.inPeriod === false && (
                                                <p className="mt-2 text-xs text-text-secondary">
                                                    არჩეული პერიოდის გარეთ
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {items.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium">
                                        პროდუქტების ცვლილებები
                                    </h4>

                                    {items.map((item, index) => (
                                        <div
                                            key={text(item.id) || index}
                                            className="rounded-xl border border-border bg-background p-3 text-sm"
                                        >
                                            <p className="break-words font-medium">
                                                {text(item.name)}
                                            </p>
                                            <p className="mt-1 text-xs text-text-secondary">
                                                რაოდენობის ცვლილება:{" "}
                                                {typeof item.quantity === "number"
                                                    ? item.quantity
                                                    : "—"}
                                            </p>
                                            <p className="mt-1 text-xs text-text-secondary">
                                                გაყიდვის თანხა: {money(item.revenue)}
                                            </p>
                                            <p className="mt-1 text-xs text-text-secondary">
                                                თვითღირებულება:{" "}
                                                {item.costComplete === true
                                                    ? money(item.cost)
                                                    : "არ არის მითითებული"}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {text(detail.note) && (
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <p className="text-xs text-text-secondary">
                                        კომენტარი
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                                        {text(detail.note)}
                                    </p>
                                </div>
                            )}

                            {(row.source === "financial" || row.source === "payment") && (
                                <p className="text-xs text-text-secondary">
                                    გადახდები და გაყიდვის აღრიცხვა სხვადასხვა მაჩვენებელია
                                    და ერთმანეთს არ ემატება. გაყიდვასა და თვითღირებულებას
                                    შორის სხვაობას ბიზნესის სხვა ხარჯები აქ არ აკლდება.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </dialog>
            {manage && (
                <ExpenseManageDialog
                    movementKey={row.key}
                    mode={manage}
                    onClose={() => setManage(null)}
                    onDone={message => {
                        setManage(null);
                        onDone(message);
                    }}
                />
            )}
        </>
    );
}