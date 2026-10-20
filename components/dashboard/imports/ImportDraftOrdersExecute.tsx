"use client";

import { useEffect, useRef, useState } from "react";

type Receipt = {
    createdCount: number;
    linkedCount: number;
    excludedCount: number;
    skippedCount: number;
    pendingCostCount: number;
    pendingOtherSections: boolean;
    customerCreatedCount: number | null;
    customerLinkedCount: number | null;
    customerSkippedCount: number | null;
};

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error("შენახვის პასუხი ვერ წავიკითხეთ.");
    }

    return value as Record<string, unknown>;
}

function count(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new Error("შენახვის შედეგი ვერ დადასტურდა.");
    }

    return value;
}

export default function ImportDraftOrdersExecute({
    draftId,
    revision,
    disabled,
    onLockChange,
    onImported,
}: {
    draftId: string;
    revision: number;
    disabled: boolean;
    onLockChange: (locked: boolean) => void;
    onImported: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState<Receipt | null>(null);

    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    async function execute() {
        if (disabled || controller.current || receipt) return;

        const current = new AbortController();
        controller.current = current;

        setBusy(true);
        setError("");
        onLockChange(true);

        let definitiveFailure = false;

        try {
            const response = await fetch(
                `/api/imports/drafts/${encodeURIComponent(draftId)}/orders/execute`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        expectedRevision: revision,
                        confirmed: true,
                    }),
                    signal: current.signal,
                },
            );

            const body = object(await response.json());

            if (!response.ok || body.success !== true) {
                // ადრე დაკარგული პასუხის შემდეგ მხოლოდ
                // უარყოფილი მოთხოვნა ძველ შედეგს ვერ დაადასტურებს.
                definitiveFailure =
                    !uncertain &&
                    response.status >= 400 &&
                    response.status < 500;

                throw new Error(
                    typeof body.message === "string"
                        ? body.message
                        : "შენახვის შედეგი ვერ დადასტურდა.",
                );
            }

            const saved = object(body.receipt);

            if (
                saved.version !== 1 ||
                saved.draftId !== draftId ||
                saved.sourceRevision !== revision ||
                typeof saved.pendingOtherSections !== "boolean"
            ) {
                throw new Error(
                    "შენახული ვერსია პასუხში ვერ დადასტურდა.",
                );
            }

            const next: Receipt = {
                createdCount: count(saved.createdCount),
                linkedCount: count(saved.linkedCount),
                excludedCount: count(saved.excludedCount),
                skippedCount: count(saved.skippedCount),
                pendingCostCount: count(saved.pendingCostCount),
                pendingOtherSections: saved.pendingOtherSections,
                customerCreatedCount:
                    saved.customerCreatedCount === undefined
                        ? null
                        : count(saved.customerCreatedCount),
                customerLinkedCount:
                    saved.customerLinkedCount === undefined
                        ? null
                        : count(saved.customerLinkedCount),
                customerSkippedCount:
                    saved.customerSkippedCount === undefined
                        ? null
                        : count(saved.customerSkippedCount),
            };

            if (
                next.linkedCount !== 0 ||
                next.pendingCostCount > next.createdCount ||
                next.createdCount !== count(saved.totalCount)
            ) {
                throw new Error(
                    "შენახული შეკვეთების რაოდენობა პასუხში არ ემთხვევა.",
                );
            }

            if (!mounted.current) return;

            setReceipt(next);
            setUncertain(false);
            onImported();
            onLockChange(false);
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                cause instanceof Error
                    ? cause.message
                    : "შენახვის შედეგი ვერ დადასტურდა.",
            );

            setUncertain(!definitiveFailure);

            if (definitiveFailure) {
                onLockChange(false);
            }
        } finally {
            if (controller.current === current) {
                controller.current = null;

                if (mounted.current) {
                    setBusy(false);
                }
            }
        }
    }

    if (receipt) {
        return (
            <div
                role="status"
                className="space-y-2 rounded-xl border border-success/50 p-3 text-sm"
            >
                <p className="font-semibold">
                    შეკვეთების შენახვა დადასტურებულია.
                </p>

                <p>
                    შექმნილი შეკვეთები: {receipt.createdCount}.
                    {" "}გაუქმებული ან დაბრუნებული: {receipt.skippedCount}.
                    {" "}შენი არჩევანით გამოტოვებული რიგები: {receipt.excludedCount}.
                </p>

                {receipt.customerCreatedCount !== null &&
                    receipt.customerLinkedCount !== null &&
                    receipt.customerSkippedCount !== null && (
                        <div className="space-y-1 text-text-secondary">
                            <p>
                                შექმნილი მომხმარებლები:{" "}
                                {receipt.customerCreatedCount}.
                            </p>
                            <p>
                                არსებული მომხმარებლები, რომლებსაც
                                შეკვეთები დაუკავშირდა:{" "}
                                {receipt.customerLinkedCount}.
                            </p>
                            {receipt.customerSkippedCount > 0 && (
                                <p>
                                    შენი არჩევანით მომხმარებელთან
                                    დაკავშირება გამოტოვებულია:{" "}
                                    {receipt.customerSkippedCount} შემთხვევაში.
                                    შესაბამისი შეკვეთები შენახულია.
                                </p>
                            )}
                        </div>
                    )}

                {receipt.pendingCostCount > 0 && (
                    <p className="text-text-secondary">
                        {receipt.pendingCostCount} შეკვეთა შენახულია,
                        მაგრამ თვითღირებულების შევსებამდე ანალიტიკაში
                        არ ჩაითვლება.
                    </p>
                )}

                {receipt.pendingOtherSections && (
                    <p className="text-text-secondary">
                        დანარჩენი მონიშნული მონაცემები ჯერ არ
                        გადმოტანილა. გააგრძელე შემდეგი კატეგორიის
                        შემოწმებით ქვემოთ.
                    </p>
                )}

                <p className="text-text-secondary">
                    შედეგი შეკვეთების გვერდზე შეგიძლია ნახო.
                    ახალი იმპორტისთვის გაასუფთავე სია.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
            <p className="text-text-secondary">
                ეს ღილაკი შეკვეთებს რეალურად შეინახავს.
                პროდუქტები დაემატება შეკვეთის ხელით დამატებული
                პროდუქტების პრინციპით. მიმდინარე მარაგი არ შეიცვლება.
            </p>

            <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void execute()}
                className="min-h-11 rounded-xl bg-success px-4 font-semibold text-white disabled:opacity-50"
            >
                {busy
                    ? "ინახება…"
                    : uncertain
                        ? "შენახვის შედეგის გადამოწმება"
                        : "შეკვეთების საბოლოო შენახვა"}
            </button>

            {error && (
                <p role="alert" className="text-danger">
                    {error}
                </p>
            )}

            {uncertain && (
                <p className="text-text-secondary">
                    შედეგის დადასტურებამდე მონაცემებს ნუ შეცვლი.
                    იგივე ღილაკი დასრულებულ იმპორტს აღარ გაიმეორებს.
                </p>
            )}
        </div>
    );
}