"use client";

import { useState } from "react";
import {
    ORDER_IMPORT_COLUMNS,
    type OrderImportField,
} from "@/lib/imports/detect-order-columns";
import type {
    PreparedOrderSourceRow,
} from "@/lib/imports/prepare-draft-order-rows";

import {
    validateImportOrderLine,
} from "@/lib/imports/validate-import-order-line";
import type {
    OrderImportFieldIssue,
} from "@/lib/imports/prepare-import-order-group";

type Edits = Partial<Record<OrderImportField, string>>;

const primaryFields = new Set<OrderImportField>([
    "orderCode",
    "date",
    "name",
    "quantity",
    "unitPrice",
    "lineTotal",
    "unitCost",
]);

export default function OrderRowEditor({
    row,
    fieldIssues = [],
    onSave,
    onCancel,
}: {
    row: PreparedOrderSourceRow;
    fieldIssues?: readonly OrderImportFieldIssue[];
    onSave: (edits: Edits) => void;
    onCancel: () => void;
}) {
    const [edits, setEdits] = useState<Edits>({});

    const currentInput = {
        ...row.input,
        ...edits,
    };

    const lineCheck = validateImportOrderLine({
        name: currentInput.name,
        productCode: currentInput.productCode,
        color: currentInput.color,
        size: currentInput.size,
        quantity: currentInput.quantity,
        unitPrice: currentInput.unitPrice,
        lineTotal: currentInput.lineTotal,
        unitCost: currentInput.unitCost,
        decimalSeparator: row.decimalSeparator,
    });

    const hasEdit = (field: string) =>
        Object.prototype.hasOwnProperty.call(edits, field);

    const currentIssues = [
        ...fieldIssues.filter(issue =>
            issue.rowKey === row.key &&
            issue.field !== null &&
            !hasEdit(issue.field)
        ),
        ...row.issues.filter(issue =>
            issue.severity === "ERROR" &&
            issue.field !== null &&
            !hasEdit(issue.field)
        ),
        ...lineCheck.issues.filter(issue =>
            issue.severity === "ERROR"
        ),
    ];

    function messagesFor(field: OrderImportField): string[] {
        return [...new Set(
            currentIssues
                .filter(issue => issue.field === field)
                .map(issue => issue.message),
        )];
    }

    const hasExtraErrors = ORDER_IMPORT_COLUMNS.some(
        definition =>
            !primaryFields.has(definition.field) &&
            messagesFor(definition.field).length > 0,
    );

    function field(
        definition: typeof ORDER_IMPORT_COLUMNS[number],
    ) {
        const edited = Object.prototype.hasOwnProperty.call(
            edits,
            definition.field,
        );

        const raw = row.input[definition.field];

        const messages = messagesFor(definition.field);
        const invalid = messages.length > 0;
        const errorId =
            `order-row-${row.rowNumber}-${definition.field}-error`;

        const value = edited
            ? edits[definition.field] ?? ""
            : raw === null || raw === undefined
                ? ""
                : String(raw);

        return (
            <label
                key={definition.field}
                className="block min-w-0 space-y-1"
            >
                <span className="text-sm">
                    {definition.label}
                    {definition.field === "unitCost"
                        ? " - არასავალდებულო"
                        : ""}
                </span>
                <input
                    type="text"
                    value={value}
                    onChange={event => setEdits(current => ({
                        ...current,
                        [definition.field]: event.target.value,
                    }))}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? errorId : undefined}
                    className={[
                        "min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base text-text-primary",
                        invalid
                            ? "border-danger ring-1 ring-danger/30"
                            : "border-border",
                    ].join(" ")}
                />

                {invalid && (
                    <div
                        id={errorId}
                        className="space-y-1 text-sm text-danger"
                    >
                        {messages.map(message => (
                            <p key={message}>{message}</p>
                        ))}
                    </div>
                )}
            </label>
        );
    }

    return (
        <div className="space-y-4 rounded-xl border border-border p-3">
            <p className="break-words text-sm font-semibold">
                {row.fileName} / {row.sheetName}
                {" "}- რიგი {row.rowNumber}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                {ORDER_IMPORT_COLUMNS
                    .filter(item => primaryFields.has(item.field))
                    .map(field)}
            </div>

            <details
                key={`${row.key}:${hasExtraErrors}`}
                open={hasExtraErrors || undefined}
                className="space-y-3"
            >
                <summary className="cursor-pointer text-sm">
                    გადახდა, მომხმარებელი და სხვა მონაცემები
                </summary>
                <div className="grid gap-3 sm:grid-cols-2">
                    {ORDER_IMPORT_COLUMNS
                        .filter(item => !primaryFields.has(item.field))
                        .map(field)}
                </div>
            </details>

            <p className="text-xs text-text-secondary">
                ცვლილება შეეხება მხოლოდ იმპორტის ამ რიგს.
                წყაროს ფაილი არ შეიცვლება. საერთო მონაცემების
                შესავსებად შეგიძლია ზედა საერთო არჩევანები გამოიყენო.
            </p>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    disabled={Object.keys(edits).length === 0}
                    onClick={() => onSave(edits)}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                >
                    შესწორების გამოყენება
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm"
                >
                    დახურვა
                </button>
            </div>
        </div>
    );
}