"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import ImportDraftProductsExecute from "./ImportDraftProductsExecute";

type Result = {
    total: number;
    excludedCount: number;
    createCount: number;
    linkCount: number;
    problemCount: number;
    mappingProblemCount: number;
    unknownCostCount: number;
    messages: string[];
    canImport: boolean;
    pendingImageCount: number;
};

function object(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
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
        throw new Error("შემოწმების შედეგი ვერ დადასტურდა.");
    }

    return value;
}

export default function ImportDraftProductsCheck({
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

    useEffect(() => {
        return () => controller.current?.abort();
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
                `/api/imports/drafts/${encodeURIComponent(draftId)}/products/check`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        expectedRevision: revision,
                    }),
                    signal: current.signal,
                },
            );

            const raw: unknown = await response.json();
            const body = object(raw);

            if (!response.ok || body.success !== true) {
                throw new Error(
                    typeof body.message === "string"
                        ? body.message
                        : "მონახაზის შემოწმება ვერ დასრულდა.",
                );
            }

            if (
                body.draftId !== draftId ||
                body.revision !== revision
            ) {
                throw new Error(
                    "შემოწმების შედეგი შენახულ ვერსიას არ შეესაბამება.",
                );
            }

            const summary = object(body.summary);

            if (
                !Array.isArray(body.problems) ||
                !Array.isArray(body.mappingProblems)
            ) {
                throw new Error(
                    "შემოწმების დეტალები ვერ წავიკითხეთ.",
                );
            }

            let stockDateMessageShown = false;
            const messages = [
                ...body.mappingProblems,
                ...body.problems,
            ].flatMap(rawProblem => {
                const problem = object(rawProblem);
                if (problem.code === "STOCK_DATE") {
                    if (stockDateMessageShown) return [];
                    stockDateMessageShown = true;
                    return ["მარაგის თარიღი აკლია ან არასწორია. დააჭირე „ამ კატეგორიის მონაცემების შესწორება“ და პროდუქტების ეტაპზე ერთხელ მიუთითე სწორი თარიღი."];
                }

                if (
                    typeof problem.fileName !== "string" ||
                    typeof problem.sheetName !== "string" ||
                    typeof problem.message !== "string"
                ) {
                    throw new Error(
                        "პრობლემის აღწერა ვერ წავიკითხეთ.",
                    );
                }

                const row =
                    typeof problem.rowNumber === "number"
                        ? ` - რიგი ${problem.rowNumber}`
                        : "";

                return [(
                    `${problem.fileName} / ${problem.sheetName}` +
                    `${row}: ${problem.message}`
                )];
            });

            const next: Result = {
                canImport: body.finalImportAvailable === true,
                pendingImageCount: count(summary.pendingImageCount),
                total: count(summary.total),
                excludedCount: count(summary.excludedCount),
                createCount: count(summary.createCount),
                linkCount: count(summary.linkCount),
                problemCount: count(summary.problemCount),
                mappingProblemCount: count(
                    summary.mappingProblemCount,
                ),
                unknownCostCount: count(
                    summary.unknownCostCount,
                ),
                messages,
            };

            if (!current.signal.aborted) setResult(next);
        } catch (cause) {
            if (!current.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "შემოწმება ვერ დასრულდა.",
                );
            }
        } finally {
            if (controller.current === current) {
                controller.current = null;

                if (!current.signal.aborted) {
                    setBusy(false);
                }
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
        <section className="space-y-3 border-t border-border pt-3">
            <button
                type="button"
                disabled={disabled || busy || executionLocked || completed}
                onClick={() => void check()}
                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
            >
                {busy
                    ? "სერვერზე მოწმდება…"
                    : "შენახული პროდუქტების სერვერზე შემოწმება"}
            </button>

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {result && (
                <div className="space-y-3 text-sm">
                    <p role="status">
                        შემოწმებულია: {result.total}.
                        {" "}ახალი: {result.createCount}.
                        {" "}არსებულთან კავშირი: {result.linkCount}.
                        {" "}გადასაწყვეტი: {result.problemCount}.
                        {" "}სვეტების პრობლემა:{" "}
                        {result.mappingProblemCount}.
                    </p>

                    {result.messages.length > 0 && (
                        <ul className="max-h-80 list-disc space-y-2 overflow-y-auto pl-5">
                            {[...new Set(result.messages)].map(message => (
                                <li
                                    key={message}
                                    className="break-words text-danger"
                                >
                                    {message}
                                </li>
                            ))}
                        </ul>
                    )}

                    {!completed && (
                        <p className="text-text-secondary">
                            {result.total === 0 && result.excludedCount > 0
                                ? "ყველა პროდუქტი გამოტოვებულია. საბოლოო შენახვა მხოლოდ ამ არჩევანს დააფიქსირებს; პროდუქტები და მარაგები არ შეიცვლება."
                                : "შემოწმება დასრულდა. პროდუქტები და მარაგები მხოლოდ საბოლოო შენახვის ღილაკით დაემატება."}
                        </p>
                    )}

                    {result.pendingImageCount > 0 && (
                        <p className="text-text-secondary">
                            {result.pendingImageCount} პროდუქტზე ფოტოს
                            გადმოტანა დასასრულებელია. ფოტოების დაკარგვის
                            თავიდან ასაცილებლად საბოლოო შენახვა
                            ჯერ შეჩერებულია.
                        </p>
                    )}

                    {result.canImport && (
                        <ImportDraftProductsExecute
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
                </div>
            )}
        </section>
    );
}
