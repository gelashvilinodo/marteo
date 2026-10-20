"use client";

import { useEffect, useRef, useState } from "react";

type Receipt = {
    createdCount: number;
    linkedCount: number;
    stockChangeCount: number;
    pendingOtherSections: boolean;
};

function object(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
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

export default function ImportDraftProductsExecute({
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
                `/api/imports/drafts/${encodeURIComponent(draftId)}/products/execute`,
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

            const raw: unknown = await response.json();
            const body = object(raw);

            if (!response.ok || body.success !== true) {
                definitiveFailure =
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
                stockChangeCount: count(saved.stockChangeCount),
                pendingOtherSections: saved.pendingOtherSections,
            };

            if (!mounted.current) return;

            setReceipt(next);
            setUncertain(false);
            onImported();
            onLockChange(false);
        } catch (cause) {
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
                    პროდუქტების შენახვა დადასტურებულია.
                </p>

                <p>
                    ახალი: {receipt.createdCount}.
                    {" "}არსებულთან დაკავშირებული: {receipt.linkedCount}.
                    {" "}ნაშთი შეიცვალა: {receipt.stockChangeCount} ჩანაწერზე.
                </p>

                {receipt.pendingOtherSections && (
                    <p className="text-text-secondary">
                        დანარჩენი მონიშნული განყოფილებების მონაცემები
                        ჯერ არ გადმოტანილა.
                    </p>
                )}

                <p className="text-text-secondary">
                    პროდუქტების ნახვა მარაგებში შეგიძლია.
                    ახალი იმპორტისთვის გაასუფთავე სია.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
            <p className="text-text-secondary">
                ეს ღილაკი პროდუქტებს რეალურად შეინახავს და მარაგს
                შენ მიერ არჩეული წესით შეცვლის.
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
                        : "პროდუქტებისა და მარაგების შენახვა"}
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