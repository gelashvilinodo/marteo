"use client";
import { refreshAnalyticsAfterMutation } from "@/lib/analytics/refresh-analytics-client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

import { expenseCategories } from "@/lib/analytics/expense-categories";
import { useOrderLeaveGuard } from "@/components/dashboard/orders/useOrderLeaveGuard";

type Draft = {
    category: string;
    amount: string;
    expenseDate: string;
    title: string;
    note: string;
};

type Submission = Draft & {
    requestId: string;
};

function emptyDraft(): Draft {
    return {
        category: "OTHER",
        amount: "",
        expenseDate: "",
        title: "",
        note: "",
    };
}

function today() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tbilisi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const part = (type: string) =>
        parts.find(item => item.type === type)?.value ?? "";

    return `${part("year")}-${part("month")}-${part("day")}`;
}

function isSubmission(value: unknown): value is Submission {
    if (!value || typeof value !== "object") return false;

    const item = value as Record<string, unknown>;

    return [
        "requestId",
        "category",
        "amount",
        "expenseDate",
        "title",
        "note",
    ].every(key => typeof item[key] === "string");
}

export default function NewExpenseButton({
    businessId,
    autoOpen = false,
}: {
    businessId: string;
    autoOpen?: boolean;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const autoOpened = useRef(false);

    useEffect(() => {
        if (!autoOpen || autoOpened.current) return;

        autoOpened.current = true;
        trigger.current?.click();
    }, [autoOpen]);
    const running = useRef(false);

    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState<Submission | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const storageKey = `marteo:pending-expense:${businessId}`;

    useEffect(() => {
        if (open && !dialog.current?.open) {
            dialog.current?.showModal();
        }

        if (!open && dialog.current?.open) {
            dialog.current.close();
        }
    }, [open]);

    useEffect(() => {
        if (!notice) return;

        const timer = window.setTimeout(() => setNotice(""), 4000);

        return () => window.clearTimeout(timer);
    }, [notice]);

    function canLeave() {
        if (running.current) return false;
        if (!dirty) return true;

        return window.confirm(
            pending
                ? "შენახვის შედეგი ჯერ დაუდასტურებელია. მოთხოვნა შენახულია ამ ბრაუზერის ჩანართში და ხელახალი ცდა ფანჯრის გახსნით შეგიძლია. დახურავ ფანჯარას?"
                : "შეყვანილი ინფორმაცია არ არის შენახული. დახურავ ფანჯარას?",
        );
    }

    function leave() {
        setOpen(false);
        setDirty(false);
    }

    useOrderLeaveGuard({
        open,
        dirty,
        canLeave,
        leave,
    });

    function close() {
        if (canLeave()) leave();
    }

    function show() {
        let saved: Submission | null = pending;

        try {
            const stored = sessionStorage.getItem(storageKey);

            if (stored) {
                const parsed: unknown = JSON.parse(stored);

                if (isSubmission(parsed)) saved = parsed;
            }
        } catch {
            // უკვე გახსნილი ფანჯრის მოთხოვნა მეხსიერებაში რჩება.
        }

        setPending(saved);
        setDraft(saved ?? {
            ...emptyDraft(),
            expenseDate: today(),
        });
        setDirty(Boolean(saved));
        setError(
            saved
                ? "წინა შენახვის შედეგი დაუდასტურებელია. ხელახლა სცადე — იგივე ხარჯი მეორედ არ დაემატება."
                : "",
        );
        setOpen(true);
    }

    function patch<K extends keyof Draft>(
        key: K,
        value: Draft[K],
    ) {
        setDraft(current => ({ ...current, [key]: value }));
        setDirty(true);
        setError("");
    }

    async function save() {
        if (running.current) return;

        const submission: Submission = pending ?? {
            ...draft,
            requestId: crypto.randomUUID(),
        };

        // გაგზავნამდე ვინახავთ, რომ გაურკვეველი პასუხისას
        // ხელახლა სწორედ იგივე მოთხოვნა გავაგზავნოთ.
        try {
            sessionStorage.setItem(
                storageKey,
                JSON.stringify(submission),
            );
        } catch {
            setError(
                "მოთხოვნის უსაფრთხოდ შენახვა ვერ მოხერხდა. შეამოწმე ბრაუზერის საცავის ხელმისაწვდომობა და სცადე ხელახლა.",
            );
            return;
        }

        running.current = true;
        setBusy(true);
        setPending(submission);
        setDirty(true);
        setError("");

        try {
            const response = await fetch("/api/analytics/expenses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(submission),
            });

            const result: unknown = await response.json().catch(
                () => null,
            );

            const body =
                result && typeof result === "object"
                    ? result as Record<string, unknown>
                    : null;

            if (response.ok && body?.success === true) {
                sessionStorage.removeItem(storageKey);
                setPending(null);
                setDirty(false);
                setOpen(false);
                setNotice("ხარჯი წარმატებით დაემატა.");
                refreshAnalyticsAfterMutation(() => router.refresh());
                return;
            }

            // ვალიდაციის შეცდომისას შენახვა არ შესრულებულა.
            // სხვა პასუხებზე იგივე მოთხოვნას ვინარჩუნებთ.
            if ([400, 401, 403, 422].includes(response.status)) {
                sessionStorage.removeItem(storageKey);
                setPending(null);
            }

            setError(
                typeof body?.message === "string"
                    ? body.message
                    : "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე იგივე მოთხოვნით.",
            );
        } catch {
            setError(
                "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე — იგივე ხარჯი მეორედ არ დაემატება.",
            );
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    const fieldClass =
        "w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-text-primary outline-none focus:border-accent";

    return (
        <>
            <button
                ref={trigger}
                type="button"
                onClick={show}
                className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-success px-2.5 text-xs font-semibold text-white sm:gap-2 sm:px-4 sm:text-sm"
            >
                <Icon icon="solar:add-circle-linear" width={22} />
                ხარჯის დამატება
            </button>

            <dialog
                ref={dialog}
                onCancel={event => {
                    event.preventDefault();
                    close();
                }}
                className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary backdrop:bg-black/40 backdrop:backdrop-blur-sm"
            >
                <form
                    onSubmit={event => {
                        event.preventDefault();
                        void save();
                    }}
                    className="space-y-4 p-5"
                >
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold">
                            ახალი ხარჯი
                        </h2>

                        <button
                            type="button"
                            onClick={close}
                            disabled={busy}
                            aria-label="დახურვა"
                            className="rounded-xl border border-border p-2 disabled:opacity-50"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                width={24}
                            />
                        </button>
                    </div>

                    <p className="text-sm text-text-secondary">
                        მიუთითე ბიზნესის ხარჯი. შესყიდვის
                        თვითღირებულებაში უკვე გათვალისწინებული
                        თანხა აქ ხელახლა არ დაამატო.
                    </p>

                    <fieldset
                        disabled={busy || Boolean(pending)}
                        className="space-y-4 disabled:opacity-70"
                    >
                        <label className="block space-y-2">
                            <span className="text-sm">
                                კატეგორია
                            </span>

                            <select
                                value={draft.category}
                                onChange={event =>
                                    patch("category", event.target.value)
                                }
                                className={fieldClass}
                            >
                                {expenseCategories.map(item => (
                                    <option
                                        key={item.value}
                                        value={item.value}
                                    >
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block space-y-2">
                                <span className="text-sm">
                                    თანხა · ₾ *
                                </span>

                                <input
                                    required
                                    inputMode="decimal"
                                    value={draft.amount}
                                    onChange={event =>
                                        patch("amount", event.target.value)
                                    }
                                    placeholder="0.00"
                                    className={fieldClass}
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm">
                                    ხარჯის თარიღი *
                                </span>

                                <input
                                    required
                                    type="date"
                                    value={draft.expenseDate}
                                    onChange={event =>
                                        patch(
                                            "expenseDate",
                                            event.target.value,
                                        )
                                    }
                                    className={fieldClass}
                                />
                            </label>
                        </div>

                        <label className="block space-y-2">
                            <span className="text-sm">
                                დასახელება · არასავალდებულო
                            </span>

                            <input
                                value={draft.title}
                                onChange={event =>
                                    patch("title", event.target.value)
                                }
                                className={fieldClass}
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-sm">
                                კომენტარი · არასავალდებულო
                            </span>

                            <textarea
                                rows={2}
                                value={draft.note}
                                onChange={event =>
                                    patch("note", event.target.value)
                                }
                                className={fieldClass}
                            />
                        </label>
                    </fieldset>

                    {error && (
                        <p
                            role="alert"
                            className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-text-primary"
                        >
                            {error}
                        </p>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={close}
                            disabled={busy}
                            className="rounded-xl border border-border px-4 py-3 disabled:opacity-50"
                        >
                            დახურვა
                        </button>

                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-3 font-semibold text-white disabled:opacity-60"
                        >
                            {busy && (
                                <Icon
                                    icon="svg-spinners:180-ring"
                                    width={20}
                                />
                            )}

                            {busy
                                ? "ინახება..."
                                : pending
                                    ? "ხელახლა ცდა"
                                    : "ხარჯის შენახვა"}
                        </button>
                    </div>
                </form>
            </dialog>

            {notice && createPortal(
                <div
                    role="status"
                    className="fixed bottom-4 right-4 z-[1000] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 text-text-primary shadow-xl"
                >
                    <Icon
                        icon="solar:check-circle-linear"
                        width={24}
                        className="shrink-0 text-success"
                    />
                    {notice}
                </div>,
                document.body,
            )}
        </>
    );
}