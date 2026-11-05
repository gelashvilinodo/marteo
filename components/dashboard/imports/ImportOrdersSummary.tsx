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
    autoReview = false,
}: {
    autoReview?: boolean;
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
                რიგი {row.rowNumber} - ველების შესწორება
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

    // ერთნაირ პრობლემებს ერთად ვაჩვენებთ: რიგის ნომრები და
    // თანხები განსხვავდება, მიზეზი კი იგივეა.
    const problemGroups = new Map<string, {
        title: string;
        orders: PreparedDraftOrder[];
    }>();

    for (const order of result?.orders ?? []) {
        if (order.result.kind !== "NEEDS_REVIEW") continue;

        const title = (order.result.messages[0] ?? "")
            .replace(/^რიგ(ი|ები) [\d, ]+:\s*/u, "");
        const key = title.replace(/\d+([.,]\d+)?/g, "#");
        const group = problemGroups.get(key) ?? { title, orders: [] };

        group.orders.push(order);
        problemGroups.set(key, group);
    }

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
                    <p role="status" className="flex flex-wrap gap-x-3 text-sm">
                        <span className="text-success">✓ {result.summary.previewReadyCount} მზადაა</span>
                        {result.summary.reviewCount > 0 && <span className="text-danger">⚠ {result.summary.reviewCount} გასასწორებელი</span>}
                        {result.summary.skippedCount > 0 && <span className="text-text-secondary">{result.summary.skippedCount} გაუქმებული/დაბრუნებული არ გადმოვა</span>}
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
                                თქვენ გამოტოვეთ {result.summary.excludedRowCount} რიგი.
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
                            {result.summary.incompleteContactOrderCount} შეკვეთას
                            ტელეფონი ან მისამართი აკლია. გადმოვა, მაგრამ
                            მომხმარებლის ჩანაწერი არ შეიქმნება.
                        </p>
                    )}

                    {result.summary.unknownCostOrderCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            {result.summary.unknownCostOrderCount} შეკვეთას
                            თვითღირებულება აკლია. გადმოვა, მაგრამ ანალიტიკაში
                            შევსებამდე არ ჩაითვლება.
                        </p>
                    )}

                    {result.summary.confirmationRequiredCount > 0 && (
                        <p className="text-sm text-text-secondary">
                            {result.summary.confirmationRequiredCount} შეკვეთა
                            ტელეფონითა და თარიღით დავაჯგუფეთ. დაადასტურეთ ქვემოთ.
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

                    {settings.skipOrderCustomers && <p className="text-sm text-text-secondary">მომხმარებლები არ გადმოვა - მიმღების მონაცემები შეკვეთაზე დარჩება.</p>}
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
                                        ? `${row.fileName} / ${row.sheetName} - რიგი ${row.rowNumber}`
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

                    {[...problemGroups.values()].map(group => (
                        <div
                            key={group.title}
                            className="space-y-2 rounded-xl border border-danger/40 p-3"
                        >
                            <p className="text-sm font-semibold text-danger">
                                {group.orders.length} შეკვეთა: {group.title}
                            </p>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        onExcludedRowsChange(
                                            group.orders.flatMap(order =>
                                                order.group.rows.map(row => row.key),
                                            ),
                                            true,
                                        )
                                    }
                                    className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                >
                                    {group.orders.length > 1
                                        ? `ყველას გამოტოვება (${group.orders.length})`
                                        : "გამოტოვება"}
                                </button>
                            </div>

                            <details open={group.orders.length === 1} className="text-sm">
                                <summary className="cursor-pointer text-text-secondary">
                                    {group.orders.length > 1 ? "სათითაოდ გასწორება" : "გასწორება"}
                                </summary>

                                <div className="mt-2 space-y-2">
                                    {group.orders.map(order => order.result.kind === "NEEDS_REVIEW" && (
                                        <div key={order.group.key} className="space-y-2 rounded-lg bg-background p-3">
                                            <p className="break-words font-medium">
                                                {order.group.rows[0]?.orderCode ?? `რიგები ${order.group.rows.map(row => row.rowNumber).join(", ")}`}
                                            </p>
                                            {order.result.messages.map((message, index) => (
                                                <p key={index} className="text-danger">{message}</p>
                                            ))}
                                            <div className="flex flex-wrap gap-2">
                                                {problemEditButtons(order)}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onExcludedRowsChange(
                                                            order.group.rows.map(row => row.key),
                                                            true,
                                                        )
                                                    }
                                                    className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                                >
                                                    გამოტოვება
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ))}


                </>
            )}
        </section>
    );
}