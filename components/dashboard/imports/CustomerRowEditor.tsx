"use client";

import { useState } from "react";
import type { PreparedImportCustomer } from "@/lib/imports/prepare-import-customers";
import type { ImportCustomerEdits } from "@/lib/imports/import-types";
import { validateImportCustomer } from "@/lib/imports/validate-import-customer";

export default function CustomerRowEditor({ record, onApply, onCancel }: {
    record: PreparedImportCustomer;
    onApply: (changes: ImportCustomerEdits[number]) => void;
    onCancel: () => void;
}) {
    const [changes, setChanges] = useState<ImportCustomerEdits[number]>({});
    const input = { ...record.input, ...record.data, ...changes };
    const checked = validateImportCustomer(input);
    const fields = [
        ["phone", "ტელეფონი", true], ["address", "მისამართი", true],
        ["firstName", "სახელი", false], ["lastName", "გვარი", false],
    ] as const;
    return <div className="space-y-3 border-t border-border pt-3">
        <div className="grid gap-3 sm:grid-cols-2">{fields.map(([field, label, required]) => {
            const messages = [...new Set([
                ...checked.issues,
                ...record.issues.filter(issue => !Object.prototype.hasOwnProperty.call(changes, issue.field ?? "")),
            ].filter(issue => issue.severity === "ERROR" && issue.field === field).map(issue => issue.message))];
            return <label key={field} className="block space-y-1 text-sm">
                <span>{label}{!required && " — არასავალდებულო"}</span>
                <input type="text" inputMode={field === "phone" ? "tel" : "text"} value={String(input[field] ?? "")} aria-invalid={messages.length > 0}
                    onChange={event => setChanges(current => ({ ...current, [field]: event.target.value }))}
                    className={`min-h-11 w-full rounded-xl border bg-background px-3 text-base ${messages.length ? "border-danger" : "border-border"}`} />
                {messages.map(message => <span key={message} className="block text-xs text-danger">{message}</span>)}
            </label>;
        })}</div>
        <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!Object.keys(changes).length || !checked.valid} onClick={() => onApply(changes)} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">ცვლილებების გამოყენება</button>
            <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-border px-4 text-sm">დახურვა</button>
        </div>
        <p className="text-xs text-text-secondary">ცვლილება ამ იმპორტში გამოიყენება და შედეგი ავტომატურად განახლდება. ფაილის ორიგინალი არ შეიცვლება.</p>
    </div>;
}
