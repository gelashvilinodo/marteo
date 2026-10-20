"use client";

import {
    detectCustomerColumns,
    type CustomerImportField,
} from "@/lib/imports/detect-customer-columns";
import type {
    ParsedImportSheet,
} from "@/lib/imports/import-file-types";

import type {
    ImportCustomerEdits,
    ImportCustomerEditHandler,
    ImportCustomerMapping,
} from "@/lib/imports/import-types";


function getColumn(address: string) {
    const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase();

    if (!letters) return null;

    let index = 0;

    for (const letter of letters) {
        index = index * 26 + letter.charCodeAt(0) - 64;
    }

    return { index, letters };
}

export default function CustomerColumnMapping({
    sheet,
    mapping,
    onMappingChange,
}: {
    sheet: ParsedImportSheet;
    edits: ImportCustomerEdits;
    onEdit: ImportCustomerEditHandler;
    mapping: ImportCustomerMapping;
    onMappingChange: (mapping: ImportCustomerMapping) => void;
}) {
    if (mapping.enabled !== true) return null;
    const {
        enabled,
        headerRowNumber,
        overrides,
    } = mapping;

    const headerRow = sheet.rows.find(
        row => row.rowNumber === headerRowNumber,
    );

    const headers = (headerRow?.cells ?? []).flatMap(cell => {
        const column = getColumn(cell.address);

        if (
            !column ||
            cell.errorCode !== null ||
            typeof cell.value !== "string" ||
            !cell.value.trim()
        ) {
            return [];
        }

        return [{
            columnIndex: column.index,
            letters: column.letters,
            value: cell.value,
        }];
    });

    const detected = detectCustomerColumns(headers);

    const fields = detected;

    function selectedColumn(
        field: CustomerImportField,
        automatic: number | null,
    ) {
        return Object.prototype.hasOwnProperty.call(overrides, field)
            ? overrides[field] ?? null
            : automatic;
    }

    const selected = fields.map(item => ({
        ...item,
        column: selectedColumn(
            item.field,
            item.selectedColumnIndex,
        ),
    }));

    const missing = selected.filter(
        item => item.required && item.column === null,
    );

    const conflicts = selected.filter(
        item =>
            item.column !== null &&
            selected.some(
                other =>
                    other.field !== item.field &&
                    other.column === item.column,
            ),
    );

    const inputClass =
        "min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary";

    return (
        <section className="space-y-4 rounded-xl border border-border p-4">

            {enabled && (
                <>
                    <label className="block space-y-1">
                        <span className="text-sm">
                            რომელ რიგშია სვეტების სათაურები?
                        </span>

                        <select
                            value={headerRowNumber}
                            onChange={event => {
                                onMappingChange({
                                    ...mapping,
                                    headerRowNumber: Number(event.target.value),
                                    overrides: {},
                                });
                            }}
                            className={inputClass}
                        >
                            {sheet.rows.map(row => (
                                <option
                                    key={row.rowNumber}
                                    value={row.rowNumber}
                                >
                                    რიგი {row.rowNumber}
                                </option>
                            ))}
                        </select>
                    </label>

                    <p className="text-sm text-text-secondary">
                        ტელეფონი და მისამართი აუცილებელია.
                        სახელსა და გვარსაც გადმოვიტანთ, თუ ფაილში არის.
                        მათი არქონა შეცდომა არ არის.
                        კოდიც არასავალდებულოა.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {selected.map(item => {
                            const conflict = conflicts.some(
                                entry => entry.field === item.field,
                            );

                            return (
                                <label
                                    key={item.field}
                                    className="block min-w-0 space-y-1"
                                >
                                    <span className="text-sm">
                                        {item.label}
                                        {item.required
                                            ? " — აუცილებელი"
                                            : " — არასავალდებულო"}
                                    </span>

                                    <select
                                        value={item.column ?? ""}
                                        onChange={event => {
                                            const value =
                                                event.target.value;

                                            onMappingChange({
                                                ...mapping,
                                                overrides: {
                                                    ...overrides,
                                                    [item.field]:
                                                        value === ""
                                                            ? null
                                                            : Number(value),
                                                },
                                            });
                                        }}
                                        className={inputClass}
                                    >
                                        <option value="">
                                            სვეტი არ არის არჩეული
                                        </option>

                                        {headers.map(header => (
                                            <option
                                                key={header.columnIndex}
                                                value={header.columnIndex}
                                            >
                                                {header.letters}
                                                {" — "}
                                                {header.value}
                                            </option>
                                        ))}
                                    </select>

                                    {item.column === null && (
                                        <span className="block text-xs text-text-secondary">
                                            {item.status === "AMBIGUOUS"
                                                ? "რამდენიმე შესაძლო სვეტი ვიპოვეთ. აირჩიე შესაბამისი."
                                                : item.required
                                                    ? "სვეტი ავტომატურად ვერ ამოვიცანით. აირჩიე შესაბამისი სათაური."
                                                    : "შეგიძლია დატოვო შეუვსებელი."}
                                        </span>
                                    )}

                                    {conflict && (
                                        <span className="block text-xs text-danger">
                                            ეს სვეტი სხვა ველისთვისაც
                                            არის არჩეული. გადაამოწმე
                                            შესაბამისობა.
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>

                    {missing.length > 0 && (
                        <p className="text-sm text-text-secondary">
                            დასაკავშირებელია:{" "}
                            {missing.map(item => item.label).join(", ")}.
                            ეს ჯერ არ ნიშნავს, რომ მონაცემები ფაილში
                            არ არის — გადაამოწმე სათაურების რიგი
                            და სვეტები.
                        </p>
                    )}



                    <p className="text-xs text-text-secondary">
                        არჩევანი ამ გვერდზე ინახება.
                        ამ ნაბიჯზე ჩანაწერების შენახვა ჯერ არ ხდება.
                    </p>
                </>
            )}
        </section>
    );
}