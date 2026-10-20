"use client";

import { useState } from "react";

import type {
    CustomerImportField,
} from "@/lib/imports/detect-customer-columns";
import type {
    ParsedImportSheet,
} from "@/lib/imports/import-file-types";
import {
    validateImportCustomer,
} from "@/lib/imports/validate-import-customer";

import type {
    ImportCustomerEdits,
    ImportCustomerEditHandler,
} from "@/lib/imports/import-types";

type ColumnSelection = {
    field: CustomerImportField;
    column: number | null;
};

function columnNumber(address: string): number | null {
    const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase();

    if (!letters) return null;

    let number = 0;

    for (const letter of letters) {
        number = number * 26 + letter.charCodeAt(0) - 64;
    }

    return number;
}

export default function CustomerRowsReview({
    sheet,
    headerRowNumber,
    columns,
    edits,
    onEdit,
}: {
    sheet: ParsedImportSheet;
    headerRowNumber: number;
    columns: ColumnSelection[];
    edits: ImportCustomerEdits;
    onEdit: ImportCustomerEditHandler;
}) {
    const [reviewVisible, setReviewVisible] = useState(false);

    function updateField(
        rowNumber: number,
        field: CustomerImportField,
        value: string,
    ) {
        onEdit(rowNumber, field, value);
    }

    const editableFields: {
        field: CustomerImportField;
        label: string;
    }[] = [
            { field: "phone", label: "ტელეფონი" },
            { field: "address", label: "მისამართი" },
            { field: "firstName", label: "სახელი — არასავალდებულო" },
            { field: "lastName", label: "გვარი — არასავალდებულო" },
        ];

    const requiredConnected = ["phone", "address"].every(
        field =>
            columns.some(
                column =>
                    column.field === field &&
                    column.column !== null,
            ),
    );

    const assigned = columns.flatMap(
        column => column.column === null ? [] : [column.column],
    );

    const hasConflict = new Set(assigned).size !== assigned.length;

    if (!requiredConnected || hasConflict) {
        return (
            <p className="text-sm text-text-secondary">
                რიგების შესამოწმებლად ჯერ ტელეფონისა და
                მისამართის სვეტები დააკავშირე.
                თითოეულ ველს განსხვავებული სვეტი უნდა ჰქონდეს.
            </p>
        );
    }

    const rows = reviewVisible
        ? sheet.rows
            .filter(row => row.rowNumber > headerRowNumber)
            .flatMap(row => {
                const source = new Map(
                    row.cells.flatMap(cell => {
                        const index = columnNumber(cell.address);

                        return index === null
                            ? []
                            : [[index, cell] as const];
                    }),
                );

                const mappedCells = columns.flatMap(selection => {
                    if (selection.column === null) return [];

                    const cell = source.get(selection.column);

                    return cell
                        ? [{ field: selection.field, cell }]
                        : [];
                });

                const hasData = mappedCells.some(({ cell }) =>
                    cell.errorCode !== null ||
                    Boolean(cell.formula) ||
                    (
                        cell.value !== null &&
                        String(cell.value).trim() !== ""
                    ),
                );

                // სხვა განყოფილების მონაცემიანი, მაგრამ
                // მომხმარებლის ველებში ცარიელი რიგი არ შევქმნათ.
                if (!hasData) return [];

                const sourceIssues = mappedCells.flatMap(
                    ({ field, cell }) => {
                        if (
                            Object.prototype.hasOwnProperty.call(
                                edits[row.rowNumber] ?? {},
                                field,
                            )
                        ) {
                            return [];
                        }
                        if (cell.errorCode !== null) {
                            return [
                                `${cell.address}: წყაროს უჯრედი შეიცავს შეცდომას. მისი მნიშვნელობა სანდოდ ვერ წავიკითხეთ. გაასწორე ფორმულა ან მიუთითე სწორი მონაცემი.`,
                            ];
                        }

                        if (cell.formula && cell.value === null) {
                            return [
                                `${cell.address}: ფორმულას შენახული შედეგი არ აქვს. გახსენი ფაილი Excel-ში ან Numbers-ში, გადაანგარიშე და შეინახე, ან მიუთითე მნიშვნელობა პირდაპირ.`,
                            ];
                        }

                        return [];
                    },
                );

                const originalInput = Object.fromEntries(
                    mappedCells.map(({ field, cell }) => [
                        field,
                        cell.value,
                    ]),
                );

                const activeFields = new Set(
                    columns.map(column => column.field),
                );

                const activeEdits = Object.fromEntries(
                    Object.entries(edits[row.rowNumber] ?? {}).filter(
                        ([field]) =>
                            activeFields.has(field as CustomerImportField),
                    ),
                );

                const input = {
                    ...originalInput,
                    ...activeEdits,
                };

                const result = validateImportCustomer(input);

                return [{
                    rowNumber: row.rowNumber,
                    input,
                    valid: result.valid && sourceIssues.length === 0,
                    messages: [
                        ...sourceIssues,
                        ...result.issues.map(issue => issue.message),
                    ],
                }];
            })
        : [];

    const invalid = rows.filter(row => !row.valid);
    const warnings = rows.filter(
        row => row.valid && row.messages.length > 0,
    );
    const readyCount = rows.filter(row => row.valid).length;

    const editableRows = rows.filter(
        row =>
            !row.valid ||
            Object.prototype.hasOwnProperty.call(
                edits,
                row.rowNumber,
            ),
    );

    return (
        <div className="space-y-3 border-t border-border pt-4">
            <button
                type="button"
                onClick={() => setReviewVisible(current => !current)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm"
            >
                {reviewVisible
                    ? "შემოწმების დამალვა"
                    : "მომხმარებლების შემოწმება"}
            </button>

            {reviewVisible && (
                <>
                    <p role="status" className="text-sm">
                        შემოწმებულია: {rows.length}.
                        {" "}სავალდებულო მონაცემები გამართულია:{" "}
                        {readyCount}.
                        {" "}შესასწორებელია: {invalid.length}.
                    </p>

                    {rows.length === 0 && (
                        <p className="text-sm text-text-secondary">
                            სათაურების ქვემოთ არჩეულ სვეტებში
                            მომხმარებლის მონაცემები ვერ ვიპოვეთ.
                            გადაამოწმე რიგისა და სვეტების არჩევანი.
                        </p>
                    )}

                    {editableRows.length > 0 && (
                        <section className="space-y-3">
                            <h3 className="font-semibold">
                                ჩანაწერების შესწორება
                            </h3>

                            <p className="text-sm text-text-secondary">
                                შეცვალე საჭირო ველები აქვე.
                                სახელი და გვარი აუცილებელი არ არის.
                                გასწორებული ჩანაწერი ამ სიაში დარჩება,
                                რომ ცვლილება გადაამოწმო.
                            </p>

                            <div className="max-h-[36rem] space-y-4 overflow-y-auto">
                                {editableRows.map(row => (
                                    <div
                                        key={row.rowNumber}
                                        className={[
                                            "space-y-3 rounded-xl border p-3",
                                            row.valid
                                                ? "border-border"
                                                : "border-danger/30",
                                        ].join(" ")}
                                    >
                                        <p className="text-sm font-semibold">
                                            {sheet.name}
                                            {" — "}რიგი {row.rowNumber}
                                        </p>

                                        <p className="text-sm text-text-secondary">
                                            {row.valid
                                                ? "სავალდებულო ველები გასწორებულია."
                                                : "ამ ჩანაწერის შესანახად ქვემოთ მითითებული პრობლემები უნდა გასწორდეს."}
                                        </p>

                                        {row.messages.length > 0 && (
                                            <ul className="list-disc space-y-2 pl-5 text-sm">
                                                {row.messages.map((message, index) => (
                                                    <li key={index}>
                                                        {message}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {editableFields
                                                .filter(item =>
                                                    columns.some(
                                                        column =>
                                                            column.field === item.field,
                                                    ),
                                                )
                                                .map(item => {
                                                    const value =
                                                        row.input[item.field];

                                                    return (
                                                        <label
                                                            key={item.field}
                                                            className="block min-w-0 space-y-1"
                                                        >
                                                            <span className="text-sm">
                                                                {item.label}
                                                            </span>

                                                            <input
                                                                type="text"
                                                                inputMode={
                                                                    item.field === "phone"
                                                                        ? "tel"
                                                                        : "text"
                                                                }
                                                                value={
                                                                    value === null ||
                                                                        value === undefined
                                                                        ? ""
                                                                        : String(value)
                                                                }
                                                                onChange={event =>
                                                                    updateField(
                                                                        row.rowNumber,
                                                                        item.field,
                                                                        event.target.value,
                                                                    )
                                                                }
                                                                className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary"
                                                            />
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {warnings.length > 0 && (
                        <section className="space-y-2">
                            <h3 className="font-semibold">
                                გადასამოწმებელი ჩანაწერები
                            </h3>

                            <div className="max-h-72 space-y-3 overflow-y-auto">
                                {warnings.map(row => (
                                    <div
                                        key={row.rowNumber}
                                        className="rounded-xl border border-border p-3 text-sm"
                                    >
                                        <p className="font-semibold">
                                            {sheet.name}
                                            {" — "}რიგი {row.rowNumber}
                                        </p>

                                        {row.messages.map(
                                            (message, index) => (
                                                <p
                                                    key={index}
                                                    className="mt-2 text-text-secondary"
                                                >
                                                    {message}
                                                </p>
                                            ),
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <p className="text-xs text-text-secondary">
                        ეს შემოწმება ამოწმებს სავალდებულო ველებს.
                        დუბლიკატებისა და არსებულ მომხმარებლებთან
                        კავშირის შემოწმება შემდეგ ეტაპზე დაემატება.
                        მონაცემები ჯერ არ ინახება.
                    </p>
                </>
            )}
        </div>
    );
}