"use client";

import {
    useId,
    useRef,
    useState,
    type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

type Item = {
    id: string;
    name: string;
    quantity: number;
    attributes: string;
};

type Props = {
    purchaseId: string;
    purchaseNumber: number;
    items: Item[];
};

type Draft = {
    defectiveQuantity: string;
    defectNote: string;
};

export default function ReceivePurchaseButton({
    purchaseId,
    purchaseNumber,
    items,
}: Props) {
    const router = useRouter();
    const titleId = useId();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const requestLocked = useRef(false);

    // გაურკვეველი პასუხის შემდეგ იმავე მონაცემებით ვცდით.
    const pendingPayload = useRef<string | null>(null);

    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [saving, setSaving] = useState(false);
    const [retryPending, setRetryPending] = useState(false);
    const [error, setError] = useState("");
    const [received, setReceived] = useState(false);

    const locked = saving || retryPending;

    function openDialog() {
        if (received || requestLocked.current) return;

        if (!pendingPayload.current) {
            setDrafts(
                Object.fromEntries(
                    items.map((item) => [
                        item.id,
                        {
                            defectiveQuantity: "",
                            defectNote: "",
                        },
                    ]),
                ),
            );
            setError("");
            setRetryPending(false);
        }

        dialogRef.current?.showModal();
    }

    function closeDialog() {
        if (requestLocked.current || pendingPayload.current) return;
        dialogRef.current?.close();
    }

    function updateDraft(id: string, patch: Partial<Draft>) {
        setDrafts((current) => ({
            ...current,
            [id]: {
                defectiveQuantity:
                    current[id]?.defectiveQuantity ?? "",
                defectNote:
                    current[id]?.defectNote ?? "",
                ...patch,
            },
        }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (requestLocked.current) return;

        let payload = pendingPayload.current;

        if (!payload) {
            if (!event.currentTarget.reportValidity()) return;

            const rows = items.map((item) => {
                const draft = drafts[item.id];

                return {
                    id: item.id,
                    defectiveQuantity: Number(
                        draft?.defectiveQuantity || "0",
                    ),
                    defectNote: draft?.defectNote.trim() || "",
                };
            });

            const invalid = rows.some((row, index) =>
                !Number.isInteger(row.defectiveQuantity) ||
                row.defectiveQuantity < 0 ||
                row.defectiveQuantity > items[index].quantity
            );

            if (invalid) {
                setError("გადაამოწმე წუნდებული რაოდენობები.");
                return;
            }

            payload = JSON.stringify({ items: rows });
            pendingPayload.current = payload;
        }

        requestLocked.current = true;
        setSaving(true);
        setRetryPending(true);
        setError("");

        try {
            const response = await fetch(
                `/api/purchases/${encodeURIComponent(purchaseId)}/receive`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: payload,
                },
            );

            const raw: unknown = await response.json().catch(() => null);

            const data =
                typeof raw === "object" &&
                    raw !== null &&
                    !Array.isArray(raw)
                    ? raw as Record<string, unknown>
                    : null;

            if (!response.ok) {
                // ამ სტატუსებზე სერვერმა მოთხოვნა უარყო.
                if (
                    [400, 401, 403, 404, 409, 413, 415].includes(
                        response.status,
                    )
                ) {
                    pendingPayload.current = null;
                    setRetryPending(false);
                }

                throw new Error(
                    typeof data?.error === "string"
                        ? data.error
                        : "მიღების შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
                );
            }

            if (data?.success !== true) {
                throw new Error(
                    "მიღების შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
                );
            }

            pendingPayload.current = null;
            setRetryPending(false);
            setReceived(true);
            dialogRef.current?.close();
            router.refresh();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "მიღების შედეგი ვერ დადასტურდა.",
            );
        } finally {
            requestLocked.current = false;
            setSaving(false);
        }
    }

    if (received) {
        return (
            <p role="status" className="mt-3 text-sm text-success">
                პარტია მიღებულია
            </p>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-success px-4 text-sm font-medium text-white transition hover:bg-success-hover sm:w-auto"
            >
                პარტიის მიღება
            </button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onCancel={(event) => {
                    if (
                        requestLocked.current ||
                        pendingPayload.current
                    ) {
                        event.preventDefault();
                    }
                }}
                className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/50"
            >
                <form onSubmit={submit}>
                    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                        <h2
                            id={titleId}
                            className="text-base font-semibold"
                        >
                            პარტია #{String(purchaseNumber).padStart(3, "0")} — მიღება
                        </h2>

                        <button
                            type="button"
                            onClick={closeDialog}
                            disabled={locked}
                            aria-label="მიღების ფანჯრის დახურვა"
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-text-secondary hover:bg-background disabled:opacity-40"
                        >
                            ×
                        </button>
                    </div>

                    <fieldset disabled={locked} className="space-y-3 p-4">
                        {items.map((item) => {
                            const draft = drafts[item.id];
                            const defective = Number(
                                draft?.defectiveQuantity || "0",
                            );

                            return (
                                <div
                                    key={item.id}
                                    className="rounded-xl border border-border bg-background p-3"
                                >
                                    <h3 className="break-words text-sm font-semibold">
                                        {item.name}
                                    </h3>

                                    {item.attributes && (
                                        <p className="mt-1 break-words text-xs text-text-secondary">
                                            {item.attributes}
                                        </p>
                                    )}

                                    <p className="mt-2 text-sm text-text-secondary">
                                        მისაღები რაოდენობა: {item.quantity} ცალი
                                    </p>

                                    <label className="mt-3 block">
                                        <span className="mb-1 block text-xs text-text-secondary">
                                            აქედან წუნდებული
                                        </span>

                                        <input
                                            type="number"
                                            min="0"
                                            max={item.quantity}
                                            step="1"
                                            placeholder="0"
                                            value={draft?.defectiveQuantity ?? ""}
                                            onChange={(event) =>
                                                updateDraft(item.id, {
                                                    defectiveQuantity:
                                                        event.target.value,
                                                    defectNote:
                                                        Number(event.target.value) > 0
                                                            ? draft?.defectNote ?? ""
                                                            : "",
                                                })
                                            }
                                            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                                        />
                                    </label>

                                    {defective > 0 && (
                                        <label className="mt-3 block">
                                            <span className="mb-1 block text-xs text-text-secondary">
                                                წუნის აღწერა
                                            </span>

                                            <textarea
                                                rows={2}
                                                maxLength={2000}
                                                value={draft?.defectNote ?? ""}
                                                onChange={(event) =>
                                                    updateDraft(item.id, {
                                                        defectNote:
                                                            event.target.value,
                                                    })
                                                }
                                                className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                                            />
                                        </label>
                                    )}
                                </div>
                            );
                        })}
                    </fieldset>

                    <div className="border-t border-border p-4">
                        {error && (
                            <p role="alert" className="mb-3 text-sm text-red-500">
                                {error}
                            </p>
                        )}

                        {retryPending && !saving && (
                            <p className="mb-3 text-xs text-text-secondary">
                                შედეგი ჯერ დაუდასტურებელია. ხელახლა ცდა
                                იმავე მონაცემებს გაგზავნის.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-success px-4 text-sm font-medium text-white hover:bg-success-hover disabled:opacity-50"
                        >
                            {saving
                                ? "ინახება..."
                                : retryPending
                                    ? "ხელახლა ცდა"
                                    : "მიღების დადასტურება"}
                        </button>
                    </div>
                </form>
            </dialog>
        </>
    );
}