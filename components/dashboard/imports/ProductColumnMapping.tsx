"use client";

import { detectProductColumns } from "@/lib/imports/detect-product-columns";
import type { ParsedImportSheet } from "@/lib/imports/import-file-types";
import type { ProductImportMapping } from "@/lib/imports/product-import-mapping";

export default function ProductColumnMapping({
    sheet,
    mapping,
    onChange,
}: {
    sheet: ParsedImportSheet;
    mapping: ProductImportMapping;
    onChange: (mapping: ProductImportMapping) => void;
}) {
    if (mapping.enabled !== true) return null;
    const header = sheet.rows.find(
        row => row.rowNumber === mapping.headerRowNumber,
    );

    const headers = (header?.cells ?? []).flatMap(cell => {
        const letters = cell.address.match(/^[A-Z]+/)?.[0];

        if (
            !letters ||
            cell.errorCode !== null ||
            typeof cell.value !== "string" ||
            !cell.value.trim()
        ) {
            return [];
        }

        let columnIndex = 0;

        for (const letter of letters) {
            columnIndex = columnIndex * 26 + letter.charCodeAt(0) - 64;
        }

        return [{
            columnIndex,
            letters,
            value: cell.value,
        }];
    });

    const selected = detectProductColumns(headers).map(item => ({
        ...item,
        column: Object.prototype.hasOwnProperty.call(
            mapping.overrides,
            item.field,
        )
            ? mapping.overrides[item.field] ?? null
            : item.selectedColumnIndex,
    }));

    const inputClass =
        "min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary";

    return (
        <section className="mt-4 space-y-4 rounded-xl border border-border p-4">

            {mapping.enabled && (
                <>
                    <label className="block space-y-1">
                        <span className="text-sm">სათაურების რიგი</span>
                        <select
                            value={mapping.headerRowNumber}
                            onChange={event =>
                                onChange({
                                    ...mapping,
                                    headerRowNumber: Number(event.target.value),
                                    overrides: {},
                                })
                            }
                            className={inputClass}
                        >
                            {sheet.rows.map(row => (
                                <option key={row.rowNumber} value={row.rowNumber}>
                                    რიგი {row.rowNumber}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-1">
                        <span className="text-sm">რა გადმოვიტანოთ?</span>
                        <select
                            value={mapping.mode}
                            onChange={event =>
                                onChange({
                                    ...mapping,
                                    mode: event.target.value === "CURRENT_STOCK"
                                        ? "CURRENT_STOCK"
                                        : "CATALOG",
                                })
                            }
                            className={inputClass}
                        >
                            <option value="CATALOG">მხოლოდ პროდუქტები</option>
                            <option value="CURRENT_STOCK">
                                პროდუქტები და მიმდინარე მარაგი
                            </option>
                        </select>
                    </label>

                    <p className="text-sm text-text-secondary">
                        {mapping.mode === "CATALOG"
                            ? "პროდუქტებს მოვამზადებთ რაოდენობის მარაგში დამატების გარეშე."
                            : "რაოდენობა უნდა ასახავდეს მიმდინარე ნაშთს. ძველი შეკვეთები მას მეორედ არ უნდა გამოაკლდეს. ამ არჩევანით ისტორიულ საწყის რაოდენობას ნუ მიუთითებ."}
                    </p>

                    <label className="block space-y-1">
                        <span className="text-sm">ათწილადის გამყოფი ფასებში</span>
                        <select
                            value={mapping.decimalSeparator}
                            onChange={event =>
                                onChange({
                                    ...mapping,
                                    decimalSeparator:
                                        event.target.value === "," ? "," : ".",
                                })
                            }
                            className={inputClass}
                        >
                            <option value=".">წერტილი — 12.50</option>
                            <option value=",">მძიმე — 12,50</option>
                        </select>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {selected.map(item => {
                            const required =
                                item.required ||
                                (
                                    mapping.mode === "CURRENT_STOCK" &&
                                    item.field === "currentStock"
                                );

                            const conflict =
                                item.column !== null &&
                                selected.some(
                                    other =>
                                        other.field !== item.field &&
                                        other.column === item.column,
                                );

                            return (
                                <label key={item.field} className="block min-w-0 space-y-1">
                                    <span className="text-sm">
                                        {item.label}
                                        {required ? " — აუცილებელი" : " — არასავალდებულო"}
                                    </span>

                                    <select
                                        value={item.column ?? ""}
                                        onChange={event =>
                                            onChange({
                                                ...mapping,
                                                overrides: {
                                                    ...mapping.overrides,
                                                    [item.field]:
                                                        event.target.value === ""
                                                            ? null
                                                            : Number(event.target.value),
                                                },
                                            })
                                        }
                                        className={inputClass}
                                    >
                                        <option value="">სვეტი არ არის არჩეული</option>
                                        {headers.map(header => (
                                            <option
                                                key={header.columnIndex}
                                                value={header.columnIndex}
                                            >
                                                {header.letters} — {header.value}
                                            </option>
                                        ))}
                                    </select>

                                    {item.column === null && required && (
                                        <span className="block text-xs text-text-secondary">
                                            მიუთითე შესაბამისი სვეტი.
                                            ავტომატურად ვერ ამოცნობა მონაცემის არქონას არ ნიშნავს.
                                        </span>
                                    )}

                                    {conflict && (
                                        <span className="block text-xs text-danger">
                                            ეს სვეტი სხვა ველისთვისაც არის არჩეული.
                                            გადაამოწმე დაკავშირება.
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>

                    <p className="text-xs text-text-secondary">
                        კოდი და ფოტო აუცილებელი არ არის.
                        უცნობ თვითღირებულებას ნულად არ ჩავთვლით.
                        ამ ეტაპზე მხოლოდ სვეტებს ვაკავშირებთ —
                        პროდუქტები და მარაგი ჯერ არ ინახება.
                    </p>
                </>
            )}
        </section>
    );
}