"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import ImportDraftCustomersExecute from "./ImportDraftCustomersExecute";

type Result = {
    canImport: boolean;
    total: number;
    createCount: number;
    linkCount: number;
    excludedCount: number;
    problemCount: number;
    mappingProblemCount: number;
    messages: string[];
};

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error(
            "მომხმარებლების შემოწმების პასუხი არასწორია.",
        );
    }

    return value as Record<string, unknown>;
}

function count(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new Error(
            "შემოწმების რაოდენობები ვერ დადასტურდა.",
        );
    }

    return value;
}

export default function ImportDraftCustomersCheck({
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
        ) {
            return;
        }

        const current = new AbortController();
        controller.current = current;

        setBusy(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch(
                `/api/imports/drafts/${encodeURIComponent(draftId)}/customers/check`,
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

            const body = object(await response.json());

            if (!response.ok || body.success !== true) {
                throw new Error(
                    typeof body.message === "string"
                        ? body.message
                        : "შემოწმება ვერ დასრულდა.",
                );
            }

            if (
                body.draftId !== draftId ||
                body.revision !== revision ||
                typeof body.finalImportAvailable !== "boolean" ||
                !Array.isArray(body.problems) ||
                !Array.isArray(body.mappingProblems)
            ) {
                throw new Error(
                    "მონახაზის შემოწმებული ვერსია ვერ დადასტურდა.",
                );
            }

            const summary = object(body.summary);

            const messages = [
                ...body.mappingProblems,
                ...body.problems,
            ].map(raw => {
                const problem = object(raw);

                if (
                    typeof problem.fileName !== "string" ||
                    typeof problem.sheetName !== "string" ||
                    typeof problem.message !== "string"
                ) {
                    throw new Error(
                        "პრობლემის აღწერა ვერ წავიკითხეთ.",
                    );
                }

                const row = typeof problem.rowNumber === "number"
                    ? ` — რიგი ${problem.rowNumber}`
                    : "";

                return (
                    `${problem.fileName} / ${problem.sheetName}` +
                    `${row}: ${problem.message}`
                );
            });

            const next: Result = {
                canImport: body.finalImportAvailable,
                total: count(summary.total),
                createCount: count(summary.createCount),
                linkCount: count(summary.linkCount),
                excludedCount: count(summary.excludedCount),
                problemCount: count(summary.problemCount),
                mappingProblemCount: count(
                    summary.mappingProblemCount,
                ),
                messages,
            };

            if (
                next.createCount +
                    next.linkCount +
                    next.problemCount !==
                next.total
            ) {
                throw new Error(
                    "შემოწმების რაოდენობები ერთმანეთს არ ემთხვევა.",
                );
            }

            if (
                next.canImport &&
                (
                    (next.total === 0 && next.excludedCount === 0) ||
                    next.problemCount > 0 ||
                    next.mappingProblemCount > 0
                )
            ) {
                throw new Error(
                    "მომხმარებლების შენახვის მზადყოფნა ვერ დადასტურდა.",
                );
            }

            if (!mounted.current || current.signal.aborted) return;

            setResult(next);
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;

            setError(
                cause instanceof Error
                    ? cause.message
                    : "შემოწმება ვერ დასრულდა.",
            );
        } finally {
            if (controller.current === current) {
                controller.current = null;

                if (mounted.current) {
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
        <section className="space-y-3 rounded-xl border border-border p-3 text-sm">
            <h3 className="font-semibold">
                მომხმარებლების საბოლოო შემოწმება
            </h3>

            <p className="text-text-secondary">
                შემოწმდება შენახული მონახაზი და MARTEO-ში
                არსებული მომხმარებლების მიმდინარე მონაცემები.
            </p>

            <button
                type="button"
                disabled={
                    disabled ||
                    busy ||
                    executionLocked ||
                    completed
                }
                onClick={() => void check()}
                className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
            >
                {busy
                    ? "მოწმდება…"
                    : result
                        ? "მომხმარებლების ხელახლა შემოწმება"
                        : "მომხმარებლების სერვერული შემოწმება"}
            </button>

            {error && (
                <p role="alert" className="text-danger">
                    {error}
                </p>
            )}

            {result && (
                <div className="space-y-3">
                    <p>
                        სულ: {result.total}.
                        {" "}ახალი: {result.createCount}.
                        {" "}არსებულთან დაკავშირება: {result.linkCount}.
                        {" "}გამოტოვებული: {result.excludedCount}.
                    </p>

                    {result.messages.length > 0 && (
                        <div
                            role="alert"
                            className="space-y-2 rounded-xl border border-danger/50 p-3"
                        >
                            <p className="font-semibold">
                                მომხმარებლები ჯერ არ შენახულა.
                                გაასწორე ქვემოთ ნაჩვენები საკითხები,
                                ხელახლა შეინახე მონახაზი და
                                შემოწმება გაიმეორე.
                            </p>

                            {result.messages.map((message, index) => (
                                <p key={index} className="text-danger">
                                    {message}
                                </p>
                            ))}
                        </div>
                    )}

                    {result.total === 0 &&
                        result.mappingProblemCount === 0 && (
                            <p className="text-text-secondary">
                                {result.excludedCount > 0
                                    ? "ყველა მომხმარებელი გამოტოვებულია. საბოლოო შენახვა მხოლოდ ამ არჩევანს დააფიქსირებს; მომხმარებლები არ დაემატება."
                                    : "მონიშნულ ფურცლებზე შესანახი მომხმარებლები ვერ მოიძებნა. გადაამოწმე ფურცლების არჩევანი."}
                            </p>
                        )}

                    {result.canImport && (
                        <ImportDraftCustomersExecute
                            draftId={draftId}
                            revision={revision}
                            disabled={disabled}
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