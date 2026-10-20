"use client";

import { useMemo, useState } from "react";
import {
    prepareDraftOrders,
    type PreparedDraftOrders,
    type PreparedDraftOrder,
} from "@/lib/imports/prepare-draft-orders";
import type {
    OrderDraftFile,
} from "@/lib/imports/prepare-draft-order-rows";
import type {
    ImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import OrderRowEditor from "./OrderRowEditor";
import type {
    PreparedOrderSourceRow,
} from "@/lib/imports/prepare-draft-order-rows";
import type {
    OrderImportEdits,
} from "@/lib/imports/order-import-mapping";
import OrderGroupingReview from "./OrderGroupingReview";
import OrderCustomersReview from "./OrderCustomersReview";
import type {
    OrderCustomerDecision,
} from "@/lib/imports/order-customer-decisions";

export default function ImportOrdersSummary({
    files,
    settings,
    onRowEdit,
    onGroupingConfirmationChange,
    onExcludedRowsChange,
    onOrderCustomerDecisionChange,
    onContinue,
    continueDisabled = false,
    autoReview = false,
}: {
    autoReview?: boolean;
    onContinue?: () => void;
    continueDisabled?: boolean;
    onOrderCustomerDecisionChange?: (
        phone: string,
        decision: OrderCustomerDecision | null,
    ) => void;
    onExcludedRowsChange: (
        keys: string[],
        excluded: boolean,
    ) => void;
    onGroupingConfirmationChange: (
        token: string,
        confirmed: boolean,
    ) => void;
    files: OrderDraftFile[];
    settings: ImportDraftSettings;
    onRowEdit: (
        row: PreparedOrderSourceRow,
        edits: OrderImportEdits[number],
    ) => void;
}) {
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
    const [checked, setChecked] = useState(autoReview);
    const [editorNotice, setEditorNotice] = useState("");

    const selected = Object.values(
        settings.orderMappings ?? {},
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const signature = JSON.stringify({
        files: files.map(item => ({
            id: item.clientFileId,
            sha256: item.file.sha256,
        })),
        settings: {
            ...settings,
            orderGroupingConfirmations: undefined,
            orderCustomerDecisions: undefined,
        },
    });

    const { result: baseResult, error } = useMemo<{
        result: PreparedDraftOrders | null;
        error: string;
    }>(() => {
        if (!checked) {
            return { result: null, error: "" };
        }

        try {
            return {
                result: prepareDraftOrders({ files, settings }),
                error: "",
            };
        } catch (cause: unknown) {
            return {
                result: null,
                error: cause instanceof Error
                    ? cause.message
                    : "შეკვეთების შემოწმება ვერ დასრულდა.",
            };
        }
    }, [checked, files, settings]);

    const confirmations = new Set(
        settings.orderGroupingConfirmations ?? [],
    );

    const currentOrders = baseResult?.orders.map(order => ({
        ...order,
        groupingConfirmed:
            order.confirmationToken === null ||
            confirmations.has(order.confirmationToken),
    })) ?? [];

    const result = baseResult === null
        ? null
        : {
            ...baseResult,
            orders: currentOrders,
            summary: {
                ...baseResult.summary,
                confirmationRequiredCount: currentOrders.filter(
                    order =>
                        order.result.kind === "PREVIEW_READY" &&
                        order.group.requiresConfirmation &&
                        !order.groupingConfirmed,
                ).length,
            },
        };

    const editingRow = editingRowKey === null
        ? null
        : result?.sourceRows.get(editingRowKey) ?? null;

    function editButton(rowKey: string) {
        const row = result?.sourceRows.get(rowKey);

        if (!row) return null;

        return (
            <button
                key={rowKey}
                type="button"
                onClick={() => setEditingRowKey(rowKey)}
                className="min-h-11 rounded-xl border border-border px-3 text-sm"
            >
                რიგი {row.rowNumber} — ველების შესწორება
            </button>
        );
    }

    function problemEditButtons(order: PreparedDraftOrder) {
        if (order.result.kind !== "NEEDS_REVIEW") return null;

        const problemRowKeys = new Set(
            order.result.fieldIssues.flatMap(issue =>
                issue.rowKey === null ? [] : [issue.rowKey],
            ),
        );

        const rows = problemRowKeys.size > 0
            ? order.group.rows.filter(row =>
                problemRowKeys.has(row.key)
            )
            : order.group.rows;

        return rows.map(row => editButton(row.key));
    }

    if (!selected) return null;

    function check() {
        setEditingRowKey(null);
        setEditorNotice("");
        setChecked(true);
    }

    return (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
            <h2 className="font-semibold">
                შეკვეთების შემოწმება
            </h2>

            <button
                hidden={autoReview}
                type="button"
                onClick={check}
                className="min-h-11 rounded-xl border border-border px-4 text-sm"
            >
                {result ? "ხელახლა შემოწმება" : "შეკვეთების შემოწმება"}
            </button>

            {!result && !error && (
                <p className="text-sm text-text-secondary">
                    {checked
                        ? "განახლებული მონაცემების შემოწმების შედეგი ვერ მომზადდა. მიზეზი ქვემოთ არის მითითებული."
                        : "შეკვეთები ჯერ არ შემოწმებულა."}
                </p>
            )}

            {editorNotice && (
                <p
                    role="status"
                    className="text-sm text-text-secondary"
                >
                    {editorNotice}
                </p>
            )}
            {editingRow && (
                <OrderRowEditor
                    key={`${editingRow.key}:${signature}`}
                    row={editingRow}
                    fieldIssues={
                        result?.orders.flatMap(order =>
                            order.result.kind === "NEEDS_REVIEW"
                                ? order.result.fieldIssues.filter(
                                    issue =>
                                        issue.rowKey === editingRow.key,
                                )
                                : [],
                        ) ?? []
                    }
                    onSave={edits => {
                        const nextSettings: ImportDraftSettings = {
                            ...settings,
                            orderEdits: {
                                ...settings.orderEdits,
                                [editingRow.fileId]: {
                                    ...settings.orderEdits?.[editingRow.fileId],
                                    [editingRow.sheetName]: {
                                        ...settings.orderEdits?.[
                                        editingRow.fileId
                                        ]?.[editingRow.sheetName],
                                        [editingRow.rowNumber]: {
                                            ...settings.orderEdits?.[
                                            editingRow.fileId
                                            ]?.[editingRow.sheetName]?.[
                                            editingRow.rowNumber
                                            ],
                                            ...edits,
                                        },
                                    },
                                },
                            },
                        };

                        try {
                            const updated = prepareDraftOrders({
                                files,
                                settings: nextSettings,
                            });

                            const remainingIssues = updated.orders.flatMap(
                                order =>
                                    order.result.kind === "NEEDS_REVIEW"
                                        ? order.result.fieldIssues.filter(
                                            issue =>
                                                issue.rowKey === editingRow.key,
                                        )
                                        : [],
                            );

                            onRowEdit(editingRow, edits);

                            if (remainingIssues.length > 0) {
                                setEditorNotice(
                                    `რიგი ${editingRow.rowNumber}: ცვლილება გამოყენებულია. მონიშნული ველები ჯერ კიდევ შესასწორებელია.`,
                                );
                            } else {
                                setEditingRowKey(null);
                                setEditorNotice(
                                    `რიგი ${editingRow.rowNumber}: ცვლილება გამოყენებულია და შემოწმების შედეგი განახლებულია. მონახაზი სერვერზე ჯერ არ შენახულა.`,
                                );
                            }
                        } catch (cause: unknown) {
                            setEditorNotice(
                                cause instanceof Error
                                    ? cause.message
                                    : "შესწორება ვერ შემოწმდა. შეყვანილი მონაცემები ფორმაში შენარჩუნებულია.",
                            );
                        }
                    }}
                    onCancel={() => setEditingRowKey(null)}
                />
            )}

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {result && (
                <>
                    <p role="status" className="text-sm">
                        შეკვეთების ჯგუფები: {result.summary.totalGroups}.
                        {" "}წინასწარ მომზადებულია:{" "}
                        {result.summary.previewReadyCount}.
                        {" "}დასაზუსტებელია: {result.summary.reviewCount}.
                        {" "}გამოტოვებულია: {result.summary.skippedCount}.
                    </p>

                    {result.summary.groupingProblemRowCount > 0 && (
                        <p className="text-sm text-danger">
                            დაჯგუფებას ელოდება{" "}
                            {result.summary.groupingProblemRowCount} რიგი.
                            ეს რიგები შეკვეთების ჯგუფების რაოდენობაში
                            ჯერ არ შედის.
                        </p>
                    )}

                    {result.summary.excludedRowCount > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm text-text-secondary">
                                შენი არჩევანით გამოტოვებულია{" "}
                                {result.summary.excludedRowCount} რიგი.
                                წყაროს ფაილიდან არაფერი წაშლილა.
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    onExcludedRowsChange(
                                        result.excludedRows.map(row => row.key),
                                        false,
                                    )
                                }
                                className="min-h-11 rounded-xl border border-border px-3 text-sm"
                            >
                                გამოტოვებული რიგების დაბრუნება
                            </button>
                        </div>
                    )}

                    {result.summary.incompleteContactOrderCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            წინასწარ მომზადებული შეკვეთებიდან{" "}
                            {result.summary.incompleteContactOrderCount}-ს
                            ტელეფონი ან მისამართი არ აქვს. ეს შეკვეთების
                            გადმოტანას არ დაბლოკავს. არასრული მონაცემებით
                            მომხმარებლის ახალ ჩანაწერს არ შევქმნით;
                            არსებული მიმღების ინფორმაცია შეკვეთაზე შენარჩუნდება.
                        </p>
                    )}

                    {result.summary.unknownCostOrderCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            წინასწარ მომზადებული შეკვეთებიდან{" "}
                            {result.summary.unknownCostOrderCount}-ს სრული
                            თვითღირებულება არ აქვს. მათი გადმოტანა
                            შესაძლებელი იქნება, მაგრამ თვითღირებულების
                            შევსებამდე ანალიტიკაში არ ჩაითვლება.
                            შევსებას იმპორტის დროსაც შეძლებ.
                        </p>
                    )}

                    {result.summary.confirmationRequiredCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            ტელეფონითა და თარიღით დაჯგუფებულია{" "}
                            {result.summary.confirmationRequiredCount}{" "}
                            წინასწარ მომზადებული შეკვეთა. შენახვამდე
                            ამ ჯგუფების დადასტურება იქნება საჭირო.
                        </p>
                    )}

                    {result.summary.skippedCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            გაუქმებული და დაბრუნებული შეკვეთები ამ ეტაპზე
                            არ გადმოგვაქვს.
                        </p>
                    )}

                    {result.summary.previewReadyCount > 0 && <details className="rounded-xl border border-border p-3">
                        <summary className="cursor-pointer text-sm">მომზადებული შეკვეთების ნახვა ({result.summary.previewReadyCount})</summary>
                        <div className="mt-3 space-y-3">{result.orders.map(order => order.result.kind === "PREVIEW_READY" ? <div key={order.group.key} className="space-y-2 rounded-lg bg-background p-3 text-sm">
                            <p className="font-medium">{order.fileName} / {order.group.rows[0]?.sheetName} · {order.result.data.date} · {order.result.data.totals.payableTotal} ₾</p>
                            {order.result.data.lines.map(line => <p key={line.rowKey}>{line.data.name} · {line.data.quantity} × {line.data.unitPrice} ₾</p>)}
                            <div className="flex flex-wrap gap-2">{order.group.rows.map(row => editButton(row.key))}</div>
                        </div> : null)}</div>
                    </details>}

                    <OrderGroupingReview
                        orders={result.orders}
                        onConfirmationChange={
                            onGroupingConfirmationChange
                        }
                        onEditRow={setEditingRowKey}
                    />

                    {settings.skipOrderCustomers && <p className="text-sm text-text-secondary">მომხმარებლების გადმოტანა გამოტოვებულია. მიმღების ინფორმაცია შეკვეთაზე დარჩება, მომხმარებლის ცალკე ჩანაწერები არ შეიქმნება.</p>}
                    {onOrderCustomerDecisionChange && !settings.skipOrderCustomers && (
                        <OrderCustomersReview
                            orders={result.orders}
                            decisions={
                                settings.orderCustomerDecisions ?? {}
                            }
                            onDecisionChange={
                                onOrderCustomerDecisionChange
                            }
                        />
                    )}

                    {result.mappingProblems.map((problem, index) => (
                        <div
                            key={`mapping:${index}`}
                            className="space-y-2 rounded-xl border border-danger/40 p-3"
                        >
                            <p className="break-words text-sm font-semibold">
                                {problem.fileName} / {problem.sheetName}
                            </p>
                            <p className="text-sm text-danger">
                                {problem.message}
                            </p>
                        </div>
                    ))}

                    {result.groupingProblems.map((problem, index) => {
                        const row = result.sourceRows.get(problem.rowKey);

                        return (
                            <div
                                key={`grouping:${index}`}
                                className="space-y-2 rounded-xl border border-danger/40 p-3"
                            >
                                <p className="break-words text-sm font-semibold">
                                    {row
                                        ? `${row.fileName} / ${row.sheetName} — რიგი ${row.rowNumber}`
                                        : "შეკვეთის დაჯგუფება"}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {editButton(problem.rowKey)}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onExcludedRowsChange(
                                                [problem.rowKey],
                                                true,
                                            )
                                        }
                                        className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                    >
                                        ამ რიგის გამოტოვება
                                    </button>
                                </div>
                                <p className="text-sm text-danger">
                                    {problem.message}
                                </p>
                            </div>
                        );
                    })}

                    {result.orders.map(order =>
                        order.result.kind === "NEEDS_REVIEW" ? (
                            <div
                                key={order.group.key}
                                className="space-y-2 rounded-xl border border-danger/40 p-3"
                            >
                                <p className="break-words text-sm font-semibold">
                                    {order.fileName} /{" "}
                                    {order.group.rows[0]?.sheetName}
                                    {" "}— რიგები{" "}
                                    {order.group.rows.map(
                                        row => row.rowNumber,
                                    ).join(", ")}
                                </p>

                                {order.result.messages.map((message, index) => (
                                    <p
                                        key={index}
                                        className="text-sm text-danger"
                                    >
                                        {message}
                                    </p>
                                ))}

                                <div className="flex flex-wrap gap-2">
                                    {problemEditButtons(order)}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onExcludedRowsChange(
                                                order.group.rows.map(
                                                    row => row.key,
                                                ),
                                                true,
                                            )
                                        }
                                        className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                    >
                                        მთელი შეკვეთის გამოტოვება
                                    </button>
                                </div>
                            </div>
                        ) : null,
                    )}

                    {onContinue &&
                        result.summary.reviewCount === 0 &&
                        result.mappingProblems.length === 0 &&
                        result.groupingProblems.length === 0 &&
                        result.summary.confirmationRequiredCount === 0 &&
                        (
                            result.summary.totalGroups > 0 ||
                            result.excludedRows.length > 0
                        ) && (
                            <div className="space-y-2 rounded-xl border border-border p-3">
                                <p className="text-sm">
                                    წინასწარი შემოწმება დასრულებულია.
                                    გააგრძელე შემდეგი კატეგორიით.
                                    საბოლოო შენახვა ბოლო ნაბიჯზე იქნება.
                                </p>

                                <button
                                    type="button"
                                    disabled={continueDisabled}
                                    onClick={onContinue}
                                    className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                    შემდეგ ეტაპზე გადასვლა
                                </button>

                                <p className="text-xs text-text-secondary">
                                    ეს მოქმედება რეალურ შეკვეთებს ჯერ
                                    არ დაამატებს. საბოლოო შენახვა
                                    შემდეგი შემოწმების შემდეგ შესრულდება.
                                </p>
                            </div>
                        )}

                    <p className="text-xs text-text-secondary">
                        ეს წინასწარი შემოწმებაა. შეკვეთები, მარაგი და
                        ფინანსები ჯერ არ იცვლება.
                    </p>
                </>
            )}
        </section>
    );
}