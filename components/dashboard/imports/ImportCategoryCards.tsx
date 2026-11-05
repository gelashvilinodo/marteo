"use client";

import {
    IMPORT_CATEGORY_LABELS,
    type ImportCategory,
} from "@/lib/imports/discover-import-sources";
import type {
    ImportCategoryStatus,
} from "@/lib/imports/summarize-import-categories";

// შემოწმების გვერდის თავი: თითო კატეგორიაზე ერთი ხაზი
// მზადაა / გასასწორებელია / არ გადმოვა და მოკლე მოქმედებები.
export default function ImportCategoryCards({
    categories,
    selected,
    completed,
    status,
    open,
    onOpen,
    onSkip,
    onInclude,
    onSkipAttention,
}: {
    categories: readonly ImportCategory[];
    selected: readonly ImportCategory[];
    completed: readonly ImportCategory[];
    status: Partial<Record<ImportCategory, ImportCategoryStatus>>;
    open: ImportCategory | null;
    onOpen: (category: ImportCategory) => void;
    onSkip: (category: ImportCategory) => void;
    onInclude: (category: ImportCategory) => void;
    onSkipAttention: (category: ImportCategory) => void;
}) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-xl font-semibold">შემოწმება</h2>
                <p className="mt-1 text-sm text-text-secondary">
                    მწვანე მზადაა. წითელი გაასწორეთ ან გამოტოვეთ.
                </p>
            </div>

            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {categories.map(category => {
                    const done = completed.includes(category);
                    const included = selected.includes(category);
                    const current = status[category];
                    const attention = current?.attention ?? 0;

                    return (
                        <li key={category} className="space-y-2 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold">{IMPORT_CATEGORY_LABELS[category]}</p>

                                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                                    {done && <span className="text-success">✓ უკვე გადმოტანილია</span>}
                                    {!done && !included && <span className="text-text-secondary">არ გადმოვა</span>}
                                    {!done && included && current && <>
                                        <span className="text-success">✓ {current.ready} მზადაა</span>
                                        {attention > 0 && <span className="text-danger">⚠ {attention} გასასწორებელი</span>}
                                        {current.waiting > 0 && <span className="text-text-secondary">{current.waiting} მოწმდება…</span>}
                                        {current.skipped > 0 && <span className="text-text-secondary">{current.skipped} არ გადმოვა</span>}
                                    </>}
                                </p>
                            </div>

                            {!done && (
                                <div className="flex flex-wrap gap-2">
                                    {included && (
                                        <button
                                            type="button"
                                            aria-expanded={open === category}
                                            onClick={() => onOpen(category)}
                                            className={`min-h-10 rounded-lg border px-3 text-sm ${attention > 0 ? "border-danger/60 text-danger" : "border-border"}`}
                                        >
                                            {open === category ? "დახურვა" : attention > 0 ? "გასწორება" : "დეტალები"}
                                        </button>
                                    )}
                                    {included && (current?.attentionKeys.length ?? 0) > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => onSkipAttention(category)}
                                            className="min-h-10 rounded-lg border border-border px-3 text-sm"
                                        >
                                            გასასწორებლების გამოტოვება
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => included ? onSkip(category) : onInclude(category)}
                                        className="min-h-10 rounded-lg border border-border px-3 text-sm text-text-secondary"
                                    >
                                        {included ? "არ გადმოვიტანო" : "გადმოვიტანო"}
                                    </button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
