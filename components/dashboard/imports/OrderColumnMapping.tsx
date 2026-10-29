"use client";

import type {
    ParsedImportSheet,
} from "@/lib/imports/import-file-types";
import type {
    OrderImportMapping,
} from "@/lib/imports/order-import-mapping";
import {
    resolveOrderColumns,
} from "@/lib/imports/resolve-order-columns";

export default function OrderColumnMapping({
    sheet,
    mapping,
    onChange,
}: {
    sheet: ParsedImportSheet;
    mapping: OrderImportMapping;
    onChange: (mapping: OrderImportMapping) => void;
}) {
    if (!mapping.enabled) return null;

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
            columnIndex = columnIndex * 26 +
                letter.charCodeAt(0) - 64;
        }

        return [{
            columnIndex,
            letters,
            value: cell.value,
        }];
    });

    const resolved = resolveOrderColumns(headers, mapping);

    const selectedCount = resolved.columns.filter(
        column => column.status === "SELECTED",
    ).length;

    const inputClass =
        "min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary";

    return (
        <section className="mt-4 space-y-4 rounded-xl border border-border p-4">
            <h3 className="font-semibold">
                შეკვეთების სვეტები
            </h3>

            <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-sm text-text-secondary">
                    საკურიერო თანხა გაყიდვაში არ ჩაითვლება.
                    მონიშნე მხოლოდ მაშინ, თუ ამ ფურცლის შესაბამის
                    თანხაში საკურიეროც გაერთიანებულია.
                    მის გამოსაკლებად ფაილში ცალკე მითითებული
                    საკურიერო თანხა დაგვჭირდება.
                </p>

                <label className="flex items-start gap-3 text-sm">
                    <input
                        type="checkbox"
                        checked={
                            mapping.orderTotalIncludesCourier === true
                        }
                        onChange={event => onChange({
                            ...mapping,
                            orderTotalIncludesCourier:
                                event.target.checked,
                        })}
                        className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span>
                        შეკვეთის სრულ თანხაში საკურიეროც შედის
                    </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                    <input
                        type="checkbox"
                        checked={
                            mapping.paidAmountIncludesCourier === true
                        }
                        onChange={event => onChange({
                            ...mapping,
                            paidAmountIncludesCourier:
                                event.target.checked,
                        })}
                        className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span>
                        გადახდილ თანხაში საკურიეროც შედის
                    </span>
                </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0 space-y-1">
                    <span className="text-sm">სათაურების რიგი</span>
                    <select
                        value={mapping.headerRowNumber}
                        onChange={event => onChange({
                            ...mapping,
                            headerRowNumber: Number(event.target.value),
                            overrides: {},
                        })}
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

                <label className="block min-w-0 space-y-1">
                    <span className="text-sm">
                        ათწილადის გამყოფი თანხებში
                    </span>
                    <select
                        value={mapping.decimalSeparator}
                        onChange={event => onChange({
                            ...mapping,
                            decimalSeparator:
                                event.target.value === "," ? "," : ".",
                        })}
                        className={inputClass}
                    >
                        <option value=".">წერტილი - 12.50</option>
                        <option value=",">მძიმე - 12,50</option>
                    </select>
                </label>
            </div>

            {!header && (
                <p role="alert" className="text-sm text-danger">
                    სათაურების არჩეული რიგი ვერ მოიძებნა.
                    აირჩიე შესაბამისი რიგი.
                </p>
            )}

            <details className="space-y-4">
                <summary className="cursor-pointer text-sm">
                    სვეტების ნახვა და შეცვლა - დაკავშირებულია{" "}
                    {selectedCount}
                    {resolved.problems.length > 0
                        ? `; დასაზუსტებელია ${resolved.problems.length}`
                        : ""}
                </summary>

                <p className="text-sm text-text-secondary">
                    სვეტის არჩაურჩევლობა მონაცემის არქონას არ ნიშნავს.
                    გამოტოვებული ინფორმაცია შემდეგ ეტაპზე საერთო
                    არჩევანით ან შესწორებით შეივსება. შეკვეთის კოდი
                    და თვითღირებულება სავალდებულო არ არის.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    {resolved.columns.map(column => (
                        <label
                            key={column.field}
                            className="block min-w-0 space-y-1"
                        >
                            <span className="text-sm">
                                {column.label}
                            </span>

                            <select
                                value={column.columnIndex ?? ""}
                                onChange={event => onChange({
                                    ...mapping,
                                    overrides: {
                                        ...mapping.overrides,
                                        [column.field]:
                                            event.target.value === ""
                                                ? null
                                                : Number(event.target.value),
                                    },
                                })}
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
                                        {header.letters} - {header.value}
                                    </option>
                                ))}
                            </select>

                            {resolved.problems
                                .filter(problem =>
                                    problem.field === column.field,
                                )
                                .map((problem, index) => (
                                    <p
                                        key={index}
                                        className="text-sm text-danger"
                                    >
                                        {problem.message}
                                    </p>
                                ))}
                        </label>
                    ))}
                </div>
            </details>
        </section>
    );
}