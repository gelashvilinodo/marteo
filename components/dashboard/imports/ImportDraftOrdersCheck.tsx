"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import ImportDraftOrdersExecute from "./ImportDraftOrdersExecute";

type Result = {
    canImport: boolean;
    createCount: number;
    pendingCostCount: number;
    skippedCount: number;
    excludedCount: number;
    problems: string[];
};

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error("შემოწმების პასუხი ვერ წავიკითხეთ.");
    }

    return value as Record<string, unknown>;
}

function count(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new Error("შემოწმების რაოდენობები ვერ დადასტურდა.");
    }

    return value;
}

export default function ImportDraftOrdersCheck({
    draftId,
    revision,
    disabled,
    onExecutionLockChange,
    onImported,
}: {
    draftId: string;
    revision: number;
    disabled: boolean;
    onExecutionLockChange: (locked: boolean) => void;
    onImported: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [executionLocked, setExecutionLocked] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<Result | null>(null);

    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    async function check() {
        if (
            disabled ||
            controller.current ||
            executionLocked ||
            completed
        ) return;

        const current = new AbortController();
        controller.current = current;
        setBusy(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch(
                `/api/imports/drafts/${encodeURIComponent(draftId)}/orders/check`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        expectedRevision: revision,
                    }),
                    signal: current.signal,
                },
            );

            const body = object(await response.json());

            if (!response.ok || body.success !== true) {
                throw new Error(
                    typeof body.message === "string"
                        ? body.message
                        : "სერვერული შემოწმება ვერ დასრულდა.",
                );
            }

            if (
                body.draftId !== draftId ||
                body.revision !== revision ||
                typeof body.finalImportAvailable !== "boolean" ||
                !Array.isArray(body.problems) ||
                !body.problems.every(
                    problem => typeof problem === "string",
                )
            ) {
                throw new Error(
                    "მონახაზის შემოწმებული ვერსია ვერ დადასტურდა.",
                );
            }

            const summary = object(body.summary);
            const confirmationCount = count(
                summary.confirmationRequiredCount,
            );

            const next: Result = {
                canImport: body.finalImportAvailable,
                createCount: count(summary.createCount),
                pendingCostCount: count(summary.pendingCostCount),
                skippedCount: count(summary.skippedCount),
                excludedCount: count(summary.excludedCount),
                problems: body.problems as string[],
            };

            if (
                next.pendingCostCount > next.createCount ||
                (
                    next.canImport &&
                    (
                        next.problems.length > 0 ||
                        confirmationCount > 0 ||
                        (
                            next.createCount === 0 &&
                            next.skippedCount === 0 &&
                            next.excludedCount === 0
                        )
                    )
                )
            ) {
                throw new Error(
                    "შემოწმების შედეგი და რაოდენობები ერთმანეთს არ ემთხვევა.",
                );
            }

            if (mounted.current && !current.signal.aborted) {
                setResult(next);
            }
        } catch (cause: unknown) {
            if (mounted.current && !current.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "სერვერული შემოწმება ვერ დასრულდა.",
                );
            }
        } finally {
            if (controller.current === current) {
                controller.current = null;

                if (mounted.current) setBusy(false);
            }
        }
    }

    const startCheck = useEffectEvent(() => { void check(); });
    useEffect(() => {
        let active = true;
        // Start after mount; cancel the Strict Mode probe before it can issue
        // a duplicate request. The request itself is read-only.
        queueMicrotask(() => { if (active) startCheck(); });
        return () => { active = false; };
    }, []);

    return (
        <section className="space-y-3 rounded-xl border border-border p-3 text-sm">
            <h3 className="font-semibold">
                შენახული შეკვეთების საბოლოო შემოწმება
            </h3>

            <button
                type="button"
                disabled={disabled || busy || executionLocked || completed}
                onClick={() => void check()}
                className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
            >
                {busy ? "მოწმდება…" : "სერვერზე შემოწმება"}
            </button>

            {error && (
                <p role="alert" className="text-danger">
                    {error}
                </p>
            )}

            {result && (
                <>
                    <p role="status">
                        შესაქმნელი შეკვეთები: {result.createCount}.
                        {" "}გაუქმებული ან დაბრუნებული: {result.skippedCount}.
                        {" "}გამოტოვებული რიგები: {result.excludedCount}.
                    </p>

                    {result.pendingCostCount > 0 && (
                        <p className="text-text-secondary">
                            {result.pendingCostCount} შეკვეთა
                            თვითღირებულების შევსებამდე ანალიტიკაში
                            არ ჩაითვლება.
                        </p>
                    )}

                    {result.problems.length > 0 && (
                        <ul className="max-h-80 list-disc space-y-2 overflow-y-auto pl-5 text-danger">
                            {[...new Set(result.problems)].map(message => (
                                <li key={message} className="break-words">
                                    {message}
                                </li>
                            ))}
                        </ul>
                    )}

                    {result.canImport && (
                        <ImportDraftOrdersExecute
                            draftId={draftId}
                            revision={revision}
                            disabled={disabled || busy}
                            onLockChange={locked => {
                                setExecutionLocked(locked);
                                onExecutionLockChange(locked);
                            }}
                            onImported={() => {
                                setCompleted(true);
                                onImported();
                            }}
                        />
                    )}
                </>
            )}
        </section>
    );
}