"use client";

import { useState } from "react";
import { validateImportProduct } from "@/lib/imports/validate-import-product";

import {
    PRODUCT_IMPORT_COLUMNS,
    type ProductImportField,
} from "@/lib/imports/detect-product-columns";
import type {
    PreparedImportProduct,
} from "@/lib/imports/prepare-import-products";
import type {
    ProductImportEdits,
} from "@/lib/imports/product-import-mapping";

export default function ProductRowEditor({
    record,
    onApply,
    onCancel,
}: {
    record: PreparedImportProduct;
    onApply: (changes: ProductImportEdits[number]) => void;
    onCancel: () => void;
}) {
    const [changes, setChanges] =
        useState<ProductImportEdits[number]>({});

    const checked = validateImportProduct({ ...record.input, ...changes }, {
        mode: record.mode, decimalSeparator: record.decimalSeparator,
    });
    function messagesFor(field: ProductImportField): string[] {
        return [...new Set([
            ...checked.issues,
            ...record.issues.filter(issue => !Object.prototype.hasOwnProperty.call(changes, issue.field ?? "")),
        ].filter(issue => issue.severity === "ERROR" && issue.field === field).map(issue => issue.message))];
    }

    function displayedValue(field: ProductImportField): string {
        if (Object.prototype.hasOwnProperty.call(changes, field)) {
            return changes[field] ?? "";
        }

        const raw = record.input[field];

        if (raw === null || raw === undefined) return "";

        if (
            typeof raw === "number" &&
            (field === "salePrice" || field === "unitCost")
        ) {
            return String(raw).replace(".", record.decimalSeparator);
        }

        return String(raw);
    }

    return (
        <div className="space-y-4 border-t border-border pt-3">
            <p className="text-xs text-text-secondary">
                თანხებში გამოიყენე{" "}
                {record.decimalSeparator === ","
                    ? "მძიმე, მაგალითად 12,50."
                    : "წერტილი, მაგალითად 12.50."}
                {" "}უცნობი თვითღირებულება დატოვე ცარიელი.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                {PRODUCT_IMPORT_COLUMNS
                    .filter(
                        item =>
                            record.mode === "CURRENT_STOCK" ||
                            item.field !== "currentStock",
                    )
                    .map(item => (
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
                                    item.field === "salePrice" ||
                                    item.field === "unitCost"
                                        ? "decimal"
                                        : item.field === "currentStock"
                                            ? "numeric"
                                            : "text"
                                }
                                value={displayedValue(item.field)}
                                onChange={event =>
                                    setChanges(current => ({
                                        ...current,
                                        [item.field]: event.target.value,
                                    }))
                                }
                                aria-invalid={messagesFor(item.field).length > 0}
                                className={`min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base text-text-primary ${messagesFor(item.field).length ? "border-danger" : "border-border"}`}
                            />
                            {messagesFor(item.field).map(message => <span key={message} className="block text-xs text-danger">{message}</span>)}
                        </label>
                    ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!Object.keys(changes).length || !checked.valid}
                    onClick={() => onApply(changes)}
                    className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                    ცვლილებების გამოყენება
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm"
                >
                    გაუქმება
                </button>
            </div>

            <p className="text-xs text-text-secondary">
                გამოყენების შემდეგ მონაცემები ხელახლა შემოწმდება.
                მონახაზში შესანარჩუნებლად შენახვის ღილაკსაც დააჭირე.
            </p>
        </div>
    );
}