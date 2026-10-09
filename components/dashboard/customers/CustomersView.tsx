"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type {
    CustomerEntry,
    CustomersPageData,
} from "@/lib/customers/get-customers-page";
import OrdersPagination from "@/components/dashboard/orders/OrdersPagination";
import InventoryFiltersDisclosure from "@/components/dashboard/inventory/InventoryFiltersDisclosure";
import CustomersPeriodSelect from "./CustomersPeriodSelect";
import CustomerForm from "./CustomerForm";
import CustomerDeleteButton from "./CustomerDeleteButton";
import { createPortal } from "react-dom";
import CustomersListSkeleton from "./CustomersListSkeleton";

const inputClass =
    "h-11 w-full min-w-0 rounded-xl border border-border " +
    "bg-background px-3 text-[16px] text-text-primary " +
    "outline-none focus:border-accent lg:text-sm";

const filters = [
    [
        "all",
        "სულ მომხმარებლები",
        "solar:users-group-rounded-linear",
        "text-accent",
    ],
    [
        "new",
        "ახალი მომხმარებლები",
        "solar:user-plus-rounded-linear",
        "text-success",
    ],
    [
        "repeat",
        "განმეორებითი მყიდველები",
        "solar:refresh-circle-linear",
        "text-warning",
    ],
    [
        "top",
        "ყველაზე ხშირი მყიდველი",
        "solar:star-linear",
        "text-accent",
    ],
] as const;

function formatDate(value: string | null) {
    if (!value) return "—";

    const timestamp = Date.parse(value);

    if (Number.isNaN(timestamp)) return "—";

    // თარიღი თბილისის დროით — სერვერსა და ბრაუზერში ერთნაირად.
    const tbilisiDate = new Date(timestamp + 4 * 60 * 60 * 1000);

    const day = String(tbilisiDate.getUTCDate()).padStart(2, "0");
    const month = String(tbilisiDate.getUTCMonth() + 1).padStart(2, "0");
    const year = tbilisiDate.getUTCFullYear();

    return `${day}.${month}.${year}`;
}

export default function CustomersView({
    data,
}: {
    data: CustomersPageData;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [selected, setSelected] = useState<CustomerEntry | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [checkedIds, setCheckedIds] = useState<string[]>([]);
    const [bulkIds, setBulkIds] = useState<string[] | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);

    const bulkDialogRef = useRef<HTMLDialogElement>(null);

    const pageIds = data.customers.map((customer) => customer.id);

    const allChecked =
        pageIds.length > 0 &&
        pageIds.every((id) => checkedIds.includes(id));

    function toggleCustomer(id: string) {
        setCheckedIds((current) =>
            current.includes(id)
                ? current.filter((value) => value !== id)
                : [...current, id],
        );
    }

    function closeBulkDialog() {
        if (bulkBusy) return;

        bulkDialogRef.current?.close();
        setBulkIds(null);
    }

    useEffect(() => {
        if (bulkIds) bulkDialogRef.current?.showModal();
    }, [bulkIds]);
    const [notice, setNotice] = useState<{
        message: string;
    } | null>(null);

    useEffect(() => {
        if (!notice) return;

        const timer = window.setTimeout(() => {
            setNotice(null);
        }, 5000);

        return () => window.clearTimeout(timer);
    }, [notice]);
    const [formCustomer, setFormCustomer] = useState<
        CustomerEntry | null | undefined
    >(undefined);

    function navigate(changes: Record<string, string | number>) {
        setCheckedIds([]);
        setSelectionMode(false);
        const params = new URLSearchParams({
            filter: data.filter,
            sort: data.sort,
            q: data.query,
            period: data.period,
            from: data.from,
            to: data.to,
            page: "1",
        });

        for (const [key, value] of Object.entries(changes)) {
            params.set(key, String(value));
        }

        startTransition(() => {
            router.push(`/dashboard/customers?${params}`, {
                scroll: false,
            });
        });
    }

    function showDetails(customer: CustomerEntry) {
        setSelected(customer);
        dialogRef.current?.showModal();
    }

    const cardValues = [
        data.summary.total,
        data.summary.newCustomers,
        data.summary.repeatCustomers,
        data.summary.topCustomer?.completedOrders ?? 0,
    ];

    const periodLabel =
        data.period === "all"
            ? "ყველა დრო"
            : `${formatDate(`${data.from}T12:00:00+04:00`)} — ${formatDate(`${data.to}T12:00:00+04:00`)
            }`;

    return (
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto min-w-0 max-w-7xl space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        მომხმარებლები
                    </h1>

                    <div className="flex w-full flex-col gap-2 sm:w-auto lg:flex-row lg:items-start">
                        <CustomersPeriodSelect
                            key={`${data.period}-${data.from}-${data.to}`}
                            period={data.period}
                            from={data.from}
                            to={data.to}
                            pending={pending}
                            onChange={(values) => navigate(values)}
                        />

                        <button
                            type="button"
                            onClick={() => setFormCustomer(null)}
                            className={
                                "inline-flex h-11 shrink-0 items-center " +
                                "justify-center gap-2 rounded-xl bg-success " +
                                "px-4 text-sm font-semibold text-white"
                            }
                        >
                            <Icon
                                icon="solar:user-plus-rounded-linear"
                                className="h-5 w-5"
                            />

                            ახალი მომხმარებელი
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {filters.map(([id, title, icon, tone], index) => (
                        <button
                            key={id}
                            type="button"
                            disabled={pending}
                            onClick={() => navigate({ filter: id })}
                            aria-pressed={data.filter === id}
                            className={[
                                "min-w-0 rounded-2xl border bg-surface",
                                "p-3 text-left transition-colors sm:p-4",
                                "disabled:opacity-60",
                                data.filter === id
                                    ? "border-accent"
                                    : "border-border",
                            ].join(" ")}
                        >
                            <div className="flex items-center gap-2">
                                <Icon
                                    icon={icon}
                                    className={`h-5 w-5 shrink-0 ${tone}`}
                                />

                                <span className="text-xs text-text-secondary sm:text-sm">
                                    {title}
                                </span>
                            </div>

                            <p className="mt-3 text-2xl font-semibold tabular-nums">
                                {cardValues[index]}
                            </p>

                            {id === "top" && (
                                <p className="mt-1 truncate text-xs text-text-secondary">
                                    {data.summary.topCustomer?.firstName ||
                                        data.summary.topCustomer?.phone ||
                                        "ჯერ არ არის"}
                                </p>
                            )}
                        </button>
                    ))}
                </div>

                <section className="min-w-0 rounded-2xl border border-border bg-surface">
                    <div className="p-4">
                        <h2 className="flex items-center gap-2 font-semibold">
                            <Icon
                                icon="solar:users-group-rounded-linear"
                                className="h-5 w-5 text-accent"
                            />

                            მომხმარებლების სია

                            <span className="text-sm font-normal text-text-secondary">
                                {data.totalCount}
                            </span>
                        </h2>

                        <InventoryFiltersDisclosure
                            hasFilters={Boolean(
                                data.query ||
                                data.filter !== "all" ||
                                data.sort !== "name-asc",
                            )}
                        >
                            <form
                                key={`${data.query}-${data.sort}-${data.filter}`}
                                className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4"
                                onSubmit={(event) => {
                                    event.preventDefault();

                                    const form = new FormData(
                                        event.currentTarget,
                                    );

                                    navigate({
                                        q: String(form.get("q") ?? ""),
                                        sort: String(form.get("sort")),
                                        filter: String(form.get("filter")),
                                    });
                                }}
                            >
                                <input
                                    name="q"
                                    aria-label="მომხმარებლის ძებნა"
                                    defaultValue={data.query}
                                    placeholder="სახელი, ტელეფონი ან მისამართი"
                                    className={inputClass}
                                />

                                <select
                                    name="filter"
                                    aria-label="მომხმარებლების ფილტრი"
                                    defaultValue={data.filter}
                                    className={inputClass}
                                >
                                    {filters.map(([id, title]) => (
                                        <option key={id} value={id}>
                                            {title}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    name="sort"
                                    aria-label="მომხმარებლების დალაგება"
                                    defaultValue={data.sort}
                                    className={inputClass}
                                >
                                    <option value="name-asc">
                                        სახელი · ა–ჰ
                                    </option>
                                    <option value="name-desc">
                                        სახელი · ჰ–ა
                                    </option>
                                    <option value="date-desc">
                                        ახლად დამატებული
                                    </option>
                                    <option value="date-asc">
                                        ძველად დამატებული
                                    </option>
                                    <option value="orders-desc">
                                        შეკვეთების რაოდენობა
                                    </option>
                                    <option value="last-order-desc">
                                        ბოლო შეკვეთა
                                    </option>
                                </select>

                                <button
                                    type="submit"
                                    disabled={pending}
                                    className={
                                        "inline-flex h-11 items-center " +
                                        "justify-center gap-2 rounded-xl " +
                                        "bg-success px-4 text-sm font-semibold " +
                                        "text-white disabled:opacity-60"
                                    }
                                >
                                    <Icon
                                        icon={
                                            pending
                                                ? "solar:refresh-linear"
                                                : "solar:magnifer-linear"
                                        }
                                        className={`h-5 w-5 ${pending ? "animate-spin" : ""
                                            }`}
                                    />
                                    ძებნა
                                </button>
                            </form>
                        </InventoryFiltersDisclosure>

                        <p className="mt-3 text-xs text-text-secondary">
                            შეკვეთების სტატისტიკა: {periodLabel}
                        </p>
                        {data.periodError && (
                            <p role="alert" className="mt-2 text-xs text-warning">
                                {data.periodError}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                                setSelectionMode((current) => !current);
                                setCheckedIds([]);
                            }}
                            className={
                                "inline-flex h-10 items-center gap-2 rounded-xl " +
                                "border border-border px-3 text-sm " +
                                "text-text-secondary transition " +
                                "hover:border-accent hover:text-accent"
                            }
                        >
                            <Icon
                                icon="solar:checklist-minimalistic-linear"
                                className="h-5 w-5"
                            />

                            {selectionMode ? "მონიშვნის გაუქმება" : "მონიშვნა"}
                        </button>

                        {selectionMode && (
                            <>
                                <span className="text-xs text-text-secondary">
                                    მონიშნულია: {checkedIds.length}
                                </span>

                                <button
                                    type="button"
                                    disabled={!checkedIds.length || pending}
                                    onClick={() => setBulkIds([...checkedIds])}
                                    className={
                                        "inline-flex h-10 items-center gap-2 " +
                                        "rounded-xl border border-border px-3 " +
                                        "text-sm text-red-400 transition " +
                                        "hover:border-red-400 disabled:opacity-50"
                                    }
                                >
                                    <Icon
                                        icon="solar:trash-bin-trash-linear"
                                        className="h-5 w-5"
                                    />

                                    მონიშნულების წაშლა
                                </button>
                            </>
                        )}
                    </div>

                    {pending ? (
                        <CustomersListSkeleton />
                    ) : (
                        <>

                            <table className="w-full table-fixed text-left text-xs sm:text-sm">
                                <thead className="sticky top-16 z-10 bg-background text-text-secondary">
                                    <tr>
                                        {selectionMode && (
                                            <th className="w-10 p-2">
                                                <input
                                                    type="checkbox"
                                                    checked={allChecked}
                                                    disabled={pending || !pageIds.length}
                                                    aria-label="მიმდინარე გვერდის ყველას მონიშვნა"
                                                    onChange={(event) => {
                                                        setCheckedIds(
                                                            event.target.checked ? [...pageIds] : [],
                                                        );
                                                    }}
                                                    className="h-4 w-4 cursor-pointer accent-accent"
                                                />
                                            </th>
                                        )}
                                        <th className="p-3 font-medium">
                                            სახელი
                                        </th>
                                        <th className="p-3 font-medium">
                                            ტელეფონი
                                        </th>
                                        <th className="hidden p-3 font-medium md:table-cell">
                                            დასრულებული შეკვეთები
                                        </th>
                                        <th className="hidden p-3 font-medium lg:table-cell">
                                            ბოლო შეკვეთა
                                        </th>
                                        <th className="w-12 p-2">
                                            <span className="sr-only">
                                                მოქმედებები
                                            </span>
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {data.customers.map((customer) => (
                                        <tr
                                            key={customer.id}
                                            className="h-16 border-t border-border"
                                        >
                                            {selectionMode && (
                                                <td className="p-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checkedIds.includes(customer.id)}
                                                        disabled={pending}
                                                        aria-label={`${customer.firstName || customer.phone
                                                            } — მონიშვნა`}
                                                        onChange={() => toggleCustomer(customer.id)}
                                                        className="h-4 w-4 cursor-pointer accent-accent"
                                                    />
                                                </td>
                                            )}
                                            <td className="p-3">
                                                <span className="block truncate font-medium">
                                                    {customer.firstName ||
                                                        "სახელი არ არის"}
                                                </span>
                                            </td>

                                            <td className="p-3">
                                                <a
                                                    href={`tel:${customer.phone}`}
                                                    className="break-all tabular-nums text-text-secondary"
                                                >
                                                    {customer.phone}
                                                </a>
                                            </td>

                                            <td className="hidden p-3 tabular-nums md:table-cell">
                                                {customer.completedOrders}
                                            </td>

                                            <td className="hidden p-3 text-text-secondary lg:table-cell">
                                                {formatDate(customer.lastOrderAt)}
                                            </td>

                                            <td className="p-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        showDetails(customer)
                                                    }
                                                    aria-label={`${customer.firstName ||
                                                        customer.phone
                                                        } — დეტალები`}
                                                    className={
                                                        "relative inline-flex h-10 w-10 items-center " +
                                                        "justify-center rounded-xl border border-border " +
                                                        "text-text-secondary transition " +
                                                        "hover:border-accent hover:text-accent"
                                                    }
                                                >
                                                    <Icon
                                                        icon="solar:menu-dots-bold"
                                                        className="h-5 w-5"
                                                    />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {!data.customers.length && (
                                <p className="p-8 text-center text-sm text-text-secondary">
                                    მომხმარებლები ვერ მოიძებნა.
                                </p>
                            )}
                        </>
                    )}

                    <OrdersPagination
                        currentPage={data.currentPage}
                        totalPages={data.totalPages}
                        onPageChange={(page) => navigate({ page })}
                    />
                </section>
            </div>

            <dialog
                ref={dialogRef}
                onClose={() => setSelected(null)}
                aria-label="მომხმარებლის დეტალები"
                className={
                    "m-auto max-h-[85dvh] w-[calc(100%-2rem)] " +
                    "max-w-lg overflow-y-auto rounded-2xl border " +
                    "border-border bg-surface p-4 text-text-primary " +
                    "shadow-2xl backdrop:bg-black/30 " +
                    "backdrop:backdrop-blur-sm"
                }
            >
                {selected && (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="font-semibold">
                                მომხმარებლის ინფორმაცია
                            </h2>

                            <button
                                type="button"
                                onClick={() => dialogRef.current?.close()}
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
                                ["სახელი", selected.firstName],
                                ["გვარი", selected.lastName],
                                ["ტელეფონი", selected.phone],
                                ["მისამართი", selected.address],
                                [
                                    "დასრულებული შეკვეთები",
                                    String(selected.completedOrders),
                                ],
                                [
                                    "ბოლო დასრულებული",
                                    formatDate(selected.lastOrderAt),
                                ],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs text-text-secondary">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 break-words">
                                        {value || "—"}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    const customer = selected;

                                    dialogRef.current?.close();
                                    setFormCustomer(customer);
                                }}
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
                                key={selected.id}
                                ids={[selected.id]}
                                onDeleted={() => dialogRef.current?.close()}
                                onSuccess={(message) => setNotice({ message })}
                            />
                        </div>
                    </>
                )}
            </dialog>
            {
                formCustomer !== undefined && (
                    <CustomerForm
                        key={formCustomer?.id ?? "new"}
                        customer={formCustomer}
                        onClose={() => setFormCustomer(undefined)}
                        onSuccess={(message) => setNotice({ message })}
                    />
                )
            }
            {
                notice && createPortal(
                    <div
                        role="status"
                        aria-live="polite"
                        className={
                            "fixed inset-x-4 " +
                            "bottom-[calc(1rem+env(safe-area-inset-bottom))] " +
                            "z-[100] flex items-center gap-3 rounded-2xl " +
                            "border border-success/30 bg-surface p-4 shadow-lg " +
                            "sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
                        }
                    >
                        <Icon
                            icon="solar:check-circle-bold-duotone"
                            className="h-6 w-6 shrink-0 text-success"
                            aria-hidden="true"
                        />

                        <p className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">
                            {notice.message}
                        </p>

                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            aria-label="შეტყობინების დახურვა"
                            className={
                                "inline-flex h-9 w-9 shrink-0 items-center " +
                                "justify-center rounded-lg text-text-secondary " +
                                "transition hover:bg-success/10"
                            }
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-5 w-5"
                                aria-hidden="true"
                            />
                        </button>
                    </div>,
                    document.body,
                )
            }
            <dialog
                ref={bulkDialogRef}
                aria-label="მონიშნული მომხმარებლების წაშლა"
                onCancel={(event) => {
                    event.preventDefault();
                    closeBulkDialog();
                }}
                className={
                    "m-auto max-h-[85dvh] w-[calc(100%-2rem)] " +
                    "max-w-lg overflow-y-auto rounded-2xl " +
                    "border border-border bg-surface p-4 " +
                    "text-text-primary shadow-2xl " +
                    "backdrop:bg-black/30 backdrop:backdrop-blur-sm"
                }
            >
                {bulkIds && (
                    <CustomerDeleteButton
                        ids={bulkIds}
                        initialConfirming
                        onBusyChange={setBulkBusy}
                        onDeleted={() => {
                            bulkDialogRef.current?.close();
                            setBulkIds(null);
                        }}
                        onSuccess={(message) => {
                            setNotice({ message });
                            setCheckedIds([]);
                            setSelectionMode(false);
                        }}
                    />
                )}
            </dialog>
        </main >
    );
}