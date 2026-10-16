"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { expenseCategories } from "@/lib/analytics/expense-categories";

type Values = {
    category: string;
    amount: string;
    expenseDate: string;
    title: string;
    note: string;
};

function object(value: unknown): Record<string, unknown> | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

const inputClass =
    "mt-1 h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary disabled:opacity-60";

export default function ExpenseManageDialog({
    movementKey,
    mode,
    onClose,
    onDone,
}: {
    movementKey: string;
    mode: "edit" | "delete";
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const submitting = useRef(false);
    const initial = useRef("");
    const headingId = useId();

    const [values, setValues] = useState<Values | null>(null);
    const [version, setVersion] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError("");
        setValues(null);
        setVersion("");

        async function load() {
            try {
                const response = await fetch(
                    `/api/analytics/movements/details?key=${encodeURIComponent(movementKey)}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                        signal: controller.signal,
                    },
                );

                const body = object(await response.json());
                const detail = object(body?.detail);

                if (
                    !response.ok ||
                    body?.success !== true ||
                    !detail ||
                    detail.source !== "expense" ||
                    detail.editable !== true ||
                    typeof detail.category !== "string" ||
                    typeof detail.amount !== "string" ||
                    typeof detail.occurredAt !== "string" ||
                    typeof detail.updatedAt !== "string"
                ) {
                    throw new Error(
                        typeof body?.message === "string"
                            ? body.message
                            : "ხარჯი ვერ ჩაიტვირთა.",
                    );
                }

                const date = new Date(detail.occurredAt);
                const updatedAt = new Date(detail.updatedAt);

                if (
                    !Number.isFinite(date.getTime()) ||
                    !Number.isFinite(updatedAt.getTime())
                ) {
                    throw new Error("ხარჯის თარიღი ვერ დამუშავდა.");
                }

                const next: Values = {
                    category: detail.category,
                    amount: detail.amount.replace(/^-/, ""),
                    expenseDate: new Date(
                        date.getTime() + 4 * 60 * 60 * 1000,
                    )
                        .toISOString()
                        .slice(0, 10),
                    title:
                        typeof detail.title === "string"
                            ? detail.title
                            : "",
                    note:
                        typeof detail.note === "string"
                            ? detail.note
                            : "",
                };

                if (!controller.signal.aborted) {
                    initial.current = JSON.stringify(next);
                    setValues(next);
                    setVersion(detail.updatedAt);
                }
            } catch (cause: unknown) {
                if (!controller.signal.aborted) {
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : "ხარჯი ვერ ჩაიტვირთა.",
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
    }, [movementKey, attempt]);

    function close() {
        if (submitting.current) return;

        const dirty =
            mode === "edit" &&
            values !== null &&
            JSON.stringify(values) !== initial.current;

        if (
            dirty &&
            !window.confirm(
                "ცვლილებები არ არის შენახული. დახურავ ფანჯარას?",
            )
        ) {
            return;
        }

        onClose();
    }

    function change(field: keyof Values, value: string) {
        setValues(current =>
            current ? { ...current, [field]: value } : current,
        );
    }

    async function submit() {
        if (submitting.current || !values || !version) return;

        submitting.current = true;
        setBusy(true);
        setError("");

        try {
            const id = movementKey.slice("expense:".length);
            const response = await fetch(
                `/api/analytics/expenses/${encodeURIComponent(id)}`,
                {
                    method: mode === "edit" ? "PATCH" : "DELETE",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        mode === "edit"
                            ? { ...values, updatedAt: version }
                            : { updatedAt: version },
                    ),
                },
            );

            const body = object(await response.json());

            if (!response.ok || body?.success !== true) {
                throw new Error(
                    typeof body?.message === "string"
                        ? body.message
                        : "მოქმედება ვერ შესრულდა.",
                );
            }

            onDone(
                mode === "edit"
                    ? "ხარჯი წარმატებით განახლდა."
                    : "ხარჯი წარმატებით წაიშალა.",
            );
        } catch (cause: unknown) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "მოქმედების შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
            );
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={dialog}
            aria-labelledby={headingId}
            onCancel={event => {
                event.preventDefault();
                close();
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <form
                onSubmit={event => {
                    event.preventDefault();
                    void submit();
                }}
                className="space-y-4 p-5"
            >
                <div className="flex items-center justify-between gap-3">
                    <h3 id={headingId} className="text-lg font-semibold">
                        {mode === "edit"
                            ? "ხარჯის რედაქტირება"
                            : "ხარჯის წაშლა"}
                    </h3>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        aria-label="დახურვა"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text-secondary disabled:opacity-50"
                    >
                        <Icon
                            icon="solar:close-circle-linear"
                            className="h-5 w-5"
                        />
                    </button>
                </div>

                {loading && (
                    <p role="status" className="py-5 text-sm text-text-secondary">
                        ხარჯი იტვირთება…
                    </p>
                )}

                {error && (
                    <p
                        role="alert"
                        className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-400"
                    >
                        {error}
                    </p>
                )}

                {!loading && !values && (
                    <button
                        type="button"
                        onClick={() => setAttempt(value => value + 1)}
                        className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                        ხელახლა ცდა
                    </button>
                )}

                {values && mode === "edit" && (
                    <fieldset disabled={busy} className="min-w-0 space-y-4">
                        <label className="block text-sm text-text-secondary">
                            კატეგორია
                            <select
                                required
                                value={values.category}
                                onChange={event =>
                                    change("category", event.target.value)
                                }
                                className={inputClass}
                            >
                                {expenseCategories.map(category => (
                                    <option
                                        key={category.value}
                                        value={category.value}
                                    >
                                        {category.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="grid min-w-0 grid-cols-2 gap-3">
                            <label className="block min-w-0 text-sm text-text-secondary">
                                თანხა · ₾
                                <input
                                    required
                                    type="text"
                                    inputMode="decimal"
                                    value={values.amount}
                                    onChange={event =>
                                        change("amount", event.target.value)
                                    }
                                    className={inputClass}
                                />
                            </label>

                            <label className="block min-w-0 text-sm text-text-secondary">
                                თარიღი
                                <input
                                    required
                                    type="date"
                                    value={values.expenseDate}
                                    onChange={event =>
                                        change("expenseDate", event.target.value)
                                    }
                                    className={inputClass}
                                />
                            </label>
                        </div>

                        <label className="block text-sm text-text-secondary">
                            დასახელება
                            <input
                                type="text"
                                value={values.title}
                                onChange={event =>
                                    change("title", event.target.value)
                                }
                                className={inputClass}
                            />
                        </label>

                        <label className="block text-sm text-text-secondary">
                            კომენტარი
                            <textarea
                                rows={3}
                                value={values.note}
                                onChange={event =>
                                    change("note", event.target.value)
                                }
                                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-[16px] text-text-primary"
                            />
                        </label>
                    </fieldset>
                )}

                {values && mode === "delete" && (
                    <div className="space-y-3">
                        <p className="text-sm text-text-secondary">
                            წაიშალოს ეს ხარჯი? ის ფინანსური გამოთვლებიდანაც
                            გამოაკლდება.
                        </p>
                        <div className="rounded-xl border border-border bg-background p-4">
                            <p className="break-words font-medium">
                                {values.title ||
                                    expenseCategories.find(
                                        item => item.value === values.category,
                                    )?.label ||
                                    "ხარჯი"}
                            </p>
                            <p className="mt-2 font-semibold">
                                {values.amount} ₾
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                    >
                        გაუქმება
                    </button>

                    {values && (
                        <button
                            type="submit"
                            disabled={busy || loading}
                            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${
                                mode === "delete" ? "delete-button" : "bg-success"
                            }`}
                        >
                            {busy && (
                                <Icon
                                    icon="solar:refresh-linear"
                                    className="h-4 w-4 animate-spin"
                                />
                            )}
                            {mode === "edit"
                                ? "ცვლილებების შენახვა"
                                : "წაშლა"}
                        </button>
                    )}
                </div>
            </form>
        </dialog>
    );
}