"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
    validateInventoryEdit,
    type InventoryEditInput,
} from "@/lib/inventory/validate-inventory-edit";

function readApiResult(value: unknown) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error("სერვერის პასუხის ფორმატი არასწორია.");
    }

    const result = value as Record<string, unknown>;

    return {
        success: result.success === true,
        message:
            typeof result.message === "string"
                ? result.message
                : "",
        data:
            result.data &&
                typeof result.data === "object" &&
                !Array.isArray(result.data)
                ? result.data as Record<string, unknown>
                : null,
    };
}

type Props = {
    inventoryItemId: string;
    onClose: () => void;
    onSaved: () => void;
};

const fieldClass =
    "mt-1 block h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent";

const fields = [
    ["name", "დასახელება *"],
    ["brand", "ბრენდი"],
    ["category", "კატეგორია"],
    ["color", "ფერი"],
    ["size", "ზომა"],
    ["salePrice", "გასაყიდი ფასი · ₾"],
] as const;

export default function InventoryEditDialog({
    inventoryItemId,
    onClose,
    onSaved,
}: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const locked = useRef(false);
    const dirtyRef = useRef(false);
    const titleId = useId();

    const [draft, setDraft] = useState<InventoryEditInput | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [loadAttempt, setLoadAttempt] = useState(0);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        if (!dialog.open) dialog.showModal();

        function warn(event: BeforeUnloadEvent) {
            if (!dirtyRef.current && !locked.current) return;
            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", warn);

        return () => {
            window.removeEventListener("beforeunload", warn);
            dialog.close();
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const timer = setTimeout(() => controller.abort(), 20000);

        async function load() {
            setLoading(true);
            setError("");

            try {
                const response = await fetch(
                    `/api/inventory/${encodeURIComponent(inventoryItemId)}`,
                    {
                        cache: "no-store",
                        signal: controller.signal,
                    },
                );

                const result = readApiResult(await response.json());

                if (!response.ok || !result.success || !result.data) {
                    throw new Error(
                        result.message || "პროდუქტი ვერ ჩაიტვირთა.",
                    );
                }

                const { id: _id, ...values } = result.data;
                const checked = validateInventoryEdit(values);

                if (active) {
                    setDraft(checked);
                    dirtyRef.current = false;
                }
            } catch (cause) {
                if (active) {
                    setError(
                        controller.signal.aborted
                            ? "ჩატვირთვის დრო ამოიწურა. სცადე ხელახლა."
                            : cause instanceof Error
                                ? cause.message
                                : "პროდუქტი ვერ ჩაიტვირთა.",
                    );
                }
            } finally {
                clearTimeout(timer);
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [inventoryItemId, loadAttempt]);

    function requestClose() {
        if (locked.current) return;

        if (
            dirtyRef.current &&
            !window.confirm(
                "ცვლილებები შენახული არ არის. დახურავ ფანჯარას და დაკარგავ შეყვანილ მონაცემებს?",
            )
        ) {
            return;
        }

        onClose();
    }

    function change(key: keyof InventoryEditInput, value: string) {
        dirtyRef.current = true;
        setDraft(current => current ? { ...current, [key]: value } : current);
        setError("");
    }

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!draft || locked.current) return;

        setError("");

        let payload: InventoryEditInput;

        try {
            payload = validateInventoryEdit(draft);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე შეყვანილი მონაცემები.",
            );
            return;
        }

        locked.current = true;
        setSaving(true);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let saved = false;

        try {
            const response = await fetch(
                `/api/inventory/${encodeURIComponent(inventoryItemId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                },
            );

            const result = readApiResult(await response.json());

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "შენახვა ვერ დადასტურდა. გადაამოწმე პროდუქტი.",
                );
            }

            dirtyRef.current = false;
            saved = true;
        } catch (cause) {
            setError(
                controller.signal.aborted
                    ? "შენახვის შედეგი დაუდასტურებელია. შეყვანილი მონაცემები შენარჩუნებულია; გადაამოწმე პროდუქტი."
                    : cause instanceof Error
                        ? cause.message
                        : "შენახვის შედეგი ვერ დადასტურდა. გადაამოწმე პროდუქტი.",
            );
        } finally {
            clearTimeout(timer);
            locked.current = false;
            setSaving(false);
        }

        if (saved) onSaved();
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onCancel={event => {
                event.preventDefault();
                requestClose();
            }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <h2 id={titleId} className="font-semibold">
                    პროდუქტის რედაქტირება
                </h2>

                <button
                    type="button"
                    onClick={requestClose}
                    disabled={saving}
                    className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                    დახურვა
                </button>
            </div>

            {loading ? (
                <p role="status" className="p-4 text-sm text-text-secondary">
                    იტვირთება…
                </p>
            ) : draft ? (
                <form onSubmit={save} className="min-w-0 space-y-4 p-4">
                    <fieldset
                        disabled={saving}
                        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                        {fields.map(([key, label]) => (
                            <label
                                key={key}
                                className={`block min-w-0 text-sm text-text-secondary ${key === "name" ? "sm:col-span-2" : ""
                                    }`}
                            >
                                {label}
                                <input
                                    type="text"
                                    required={key === "name"}
                                    inputMode={
                                        key === "salePrice" ? "decimal" : "text"
                                    }
                                    value={draft[key] ?? ""}
                                    onChange={event =>
                                        change(key, event.target.value)
                                    }
                                    className={fieldClass}
                                />
                            </label>
                        ))}

                        <label className="block min-w-0 text-sm text-text-secondary sm:col-span-2">
                            აღწერა
                            <textarea
                                rows={3}
                                value={draft.description ?? ""}
                                onChange={event =>
                                    change("description", event.target.value)
                                }
                                className="mt-1 block w-full min-w-0 resize-y rounded-xl border border-border bg-background p-3 text-[16px] text-text-primary outline-none focus:border-accent"
                            />
                        </label>
                    </fieldset>

                    <p className="text-xs leading-relaxed text-text-secondary">
                        რაოდენობა და თვითღირებულება იცვლება შესყიდვიდან.
                        ძველი შეკვეთების მონაცემები უცვლელი დარჩება.
                    </p>

                    {error && (
                        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="h-11 w-full rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {saving ? "ინახება…" : "ცვლილებების შენახვა"}
                    </button>
                </form>
            ) : (
                <div className="space-y-3 p-4">
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                    <button
                        type="button"
                        onClick={() => setLoadAttempt(value => value + 1)}
                        className="rounded-xl border border-border px-4 py-2 text-sm"
                    >
                        ხელახლა ცდა
                    </button>
                </div>
            )}
        </dialog>
    );
}