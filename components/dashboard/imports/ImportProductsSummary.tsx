"use client";

import { useState } from "react";

import {
    prepareImportProducts,
    type ProductImportSource,
    type PreparedImportProduct,
} from "@/lib/imports/prepare-import-products";
import ProductRowEditor from "./ProductRowEditor";
import ProductDuplicateChoices from "./ProductDuplicateChoices";

import {
    resolveImportProductDuplicates,
    type ProductDuplicateDecision,
} from "@/lib/imports/resolve-import-product-duplicates";

import type {
    ProductImportEdits,
} from "@/lib/imports/product-import-mapping";

import ImportSelectedSheets from "./ImportSelectedSheets";
import ExistingProductsCheck from "./ExistingProductsCheck";
import ProductImportPlan from "./ProductImportPlan";
import ProductStockDateInput from "./ProductStockDateInput";
import { buildProductImportPlan } from "@/lib/imports/build-product-import-plan";
import { getProductStockDateReview } from "@/lib/imports/product-stock-date-review";

import type {
    ImportProductCheckSnapshot,
} from "@/lib/imports/match-import-products";

import type {
    ImportExistingProductLink,
    ImportExistingProductLinks,
} from "@/lib/imports/product-import-links";

import type {
    ProductStockPolicy,
} from "@/lib/imports/product-stock-policy";

export default function ImportProductsSummary({
    sources,
    onEdit,
    onDisableSource,
    excludedKeys,
    onExcludedChange,
    onProductsChecked,
    existingLinks,
    onExistingLinkChange,
    productCheckSnapshot,
    stockPolicy,
    onStockPolicyChange,
    stockDate,
    onStockDateChange,
    duplicateDecisions,
    onDuplicateDecisionsChange,
    autoReview = false,
}: {
    autoReview?: boolean;
    stockDate: string | null;
    onStockDateChange: (date: string | null) => void;
    stockPolicy: ProductStockPolicy | null;
    onStockPolicyChange: (
        policy: ProductStockPolicy | null,
    ) => void;
    duplicateDecisions: ProductDuplicateDecision[];
    onDuplicateDecisionsChange: (
        decisions: ProductDuplicateDecision[],
    ) => void;
    sources: ProductImportSource[];
    existingLinks: ImportExistingProductLinks;
    productCheckSnapshot: ImportProductCheckSnapshot | null;
    onExistingLinkChange: (
        key: string,
        link: ImportExistingProductLink | null,
    ) => void;
    onProductsChecked: (
        snapshot: ImportProductCheckSnapshot | null,
    ) => void;
    excludedKeys: string[];
    onExcludedChange: (keys: string[]) => void;
    onDisableSource: (fileId: string, sheetName: string) => void;
    onEdit: (
        fileId: string,
        sheetName: string,
        rowNumber: number,
        changes: ProductImportEdits[number],
    ) => void;
}) {
    const [visible, setVisible] = useState(autoReview);
    const [showReadyProducts, setShowReadyProducts] =
        useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);

    if (sources.length === 0) return null;
    const activeSources = sources.filter(
        source => source.mapping.enabled === true,
    );

    if (activeSources.length === 0) return null;

    const result = visible
        ? prepareImportProducts(activeSources, excludedKeys)
        : null;

    const excludedSet = new Set(excludedKeys);

    const excludedRecords =
        visible && excludedKeys.length > 0
            ? prepareImportProducts(activeSources).records.filter(
                record => excludedSet.has(record.key),
            )
            : [];
    const preparedRecords = result?.records ?? [];

    const duplicateResolution = resolveImportProductDuplicates({
        records: preparedRecords,
        decisions: duplicateDecisions,
    });

    const records = duplicateResolution.records;
    const stockDateReview = getProductStockDateReview(buildProductImportPlan({
        records, snapshot: productCheckSnapshot, decisions: existingLinks,
        stockPolicy, stockDate,
    }), stockDate, stockPolicy);

    const ready = records.filter(record => record.status === "READY");
    const invalid = records.filter(record => record.status === "INVALID");
    const review = records.filter(record => record.status === "NEEDS_REVIEW");

    const unknownCosts = records.filter(
        record =>
            record.status !== "INVALID" &&
            record.data !== null &&
            record.data.unitCost === null,
    );

    const byKey = new Map(
        records.map(record => [record.key, record]),
    );

    const visited = new Set<string>();
    const groups: PreparedImportProduct[][] = [];

    for (const record of records) {
        if (visited.has(record.key)) continue;

        const group: PreparedImportProduct[] = [];
        const pending = [record.key];

        while (pending.length > 0) {
            const key = pending.pop();

            if (!key || visited.has(key)) continue;

            const item = byKey.get(key);

            if (!item) continue;

            visited.add(key);
            group.push(item);
            pending.push(...item.duplicateKeys);
        }

        if (group.length > 0) groups.push(group);
    }

    const labels = {
        READY: "გამართული ველები",
        INVALID: "საჭიროა შესწორება",
        NEEDS_REVIEW: "შესაძლო განმეორება — გადასამოწმებელია",
    } as const;

    function renderCard(
        record: PreparedImportProduct,
        duplicate: boolean,
    ) {
        const data = record.data;

        return (
            <article
                className={[
                    "min-w-0 space-y-3 rounded-xl border bg-surface p-3 text-sm",
                    duplicate || record.status === "INVALID"
                        ? "border-danger/60"
                        : "border-border",
                ].join(" ")}
            >
                <div className="space-y-1">
                    <p className="break-words font-semibold">
                        {record.fileName}
                        {" / "}
                        {record.sheetName}
                        {" — რიგი "}
                        {record.rowNumber}
                    </p>

                    <p className="text-text-secondary">
                        {labels[record.status]}
                    </p>
                </div>

                {data && (
                    <div className="space-y-1">
                        <p className="break-words font-semibold">
                            {data.name}
                        </p>

                        {(data.brand || data.color || data.size) && (
                            <p className="break-words text-text-secondary">
                                {[data.brand, data.color, data.size]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        )}

                        {data.sourceCode && (
                            <p>კოდი ფაილში: {data.sourceCode}</p>
                        )}

                        <p>
                            გასაყიდი ფასი:{" "}
                            {data.salePrice ?? "მითითებული არ არის"}
                        </p>

                        {record.mode === "CURRENT_STOCK" ? (
                            <>
                                <p>
                                    მიმდინარე ნაშთი: {data.currentStock}
                                </p>
                                <p>
                                    ერთეულის თვითღირებულება:{" "}
                                    {data.unitCost ?? "უცნობია"}
                                </p>
                            </>
                        ) : (
                            <p className="text-text-secondary">
                                მხოლოდ პროდუქტი — რაოდენობა
                                მარაგში დასამატებლად არ გამოიყენება.
                            </p>
                        )}
                    </div>
                )}

                {editingKey === record.key ? (
                    <ProductRowEditor
                        key={record.key}
                        record={record}
                        onApply={changes => {
                            onEdit(
                                record.fileId,
                                record.sheetName,
                                record.rowNumber,
                                changes,
                            );
                            setEditingKey(null);
                        }}
                        onCancel={() => setEditingKey(null)}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setEditingKey(record.key)}
                        className="min-h-11 rounded-xl border border-border px-3 text-sm"
                    >
                        ჩანაწერის შესწორება
                    </button>
                )}

                {editingKey !== record.key && (
                    <button
                        type="button"
                        onClick={() =>
                            onExcludedChange([
                                ...new Set([...excludedKeys, record.key]),
                            ])
                        }
                        className="min-h-11 rounded-xl border border-danger/40 px-3 text-sm text-danger"
                    >
                        იმპორტიდან გამოტოვება
                    </button>
                )}

                {record.issues.length > 0 && (
                    <ul className="list-disc space-y-2 pl-5">
                        {record.issues.map((issue, index) => (
                            <li key={index}>
                                <span
                                    className={
                                        issue.severity === "ERROR"
                                            ? "text-danger"
                                            : "text-text-secondary"
                                    }
                                >
                                    {issue.severity === "ERROR"
                                        ? "შესასწორებელია: "
                                        : "შენიშვნა: "}
                                    {issue.message}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </article>
        );
    }

    return (
        <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4">
            <h2 className="font-semibold">
                პროდუქტებისა და მარაგების შემოწმება
            </h2>

            <ImportSelectedSheets
                sources={activeSources}
                onDisable={onDisableSource}
            />

            <button
                hidden={autoReview}
                type="button"
                onClick={() => setVisible(current => !current)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm"
            >
                {visible
                    ? "შეჯამების დამალვა"
                    : "პროდუქტების შემოწმება"}
            </button>

            {result && (
                <>
                    <ProductStockDateInput
                        affectedCount={stockDateReview.affectedCount}
                        value={stockDate}
                        onChange={onStockDateChange}
                    />

                    <p role="status" className="text-sm">
                        სულ: {records.length}.
                        {" "}გამართული ველები: {ready.length}.
                        {" "}შესასწორებელია: {invalid.length}.
                        {" "}განმეორებაზე გადასამოწმებელია: {review.length}.
                        {" "}გამოტოვებულია: {excludedRecords.length}.
                    </p>

                    {unknownCosts.length > 0 && (
                        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
                            <p className="font-semibold">
                                ფაილში თვითღირებულება მითითებული
                                არ არის {unknownCosts.length} პროდუქტზე.
                            </p>

                            <p className="text-text-secondary">
                                ეს იმპორტს არ დაბლოკავს. უცნობ
                                ღირებულებას ნულად არ ჩავთვლით.
                                თუ პროდუქტის თვითღირებულება
                                გაყიდვის დროსაც უცნობი იქნება,
                                მოგების დასათვლელად მისი შევსება
                                დაგჭირდება.
                            </p>

                            <p className="text-text-secondary">
                                შეგიძლია ახლა შეავსო პროდუქტების
                                რედაქტირებიდან ან გააგრძელო მის გარეშე.
                            </p>
                        </div>
                    )}

                    {result.mappingProblems.map((problem, index) => (
                        <div
                            key={index}
                            className="space-y-2 rounded-xl border border-danger/40 p-3 text-sm"
                        >
                            <p className="break-words font-semibold">
                                {problem.fileName}
                                {" / "}
                                {problem.sheetName}
                            </p>
                            <p>{problem.message}</p>
                            <p className="text-text-secondary">
                                ამ ფურცლის რიგები რაოდენობებში
                                ჯერ არ შედის.
                            </p>
                        </div>
                    ))}

                    <ProductDuplicateChoices
                        records={preparedRecords}
                        decisions={duplicateDecisions}
                        onChange={onDuplicateDecisionsChange}
                    />

                    {duplicateResolution.omittedDuplicates.length > 0 && (
                        <section className="space-y-3 rounded-xl border border-border p-3 text-sm">
                            <h3 className="font-semibold">
                                განმეორების გამო გამოტოვებული ჩანაწერები
                            </h3>

                            <p className="text-text-secondary">
                                გამოიყენება შენ მიერ დატოვებული ჩანაწერის
                                მონაცემები. ქვემოთ ჩამოთვლილი რიგების
                                რაოდენობები მას არ ემატება.
                                არჩევანის შეცვლა ზემოთ შეგიძლია.
                            </p>

                            {duplicateResolution.omittedDuplicates.map(
                                record => {
                                    const keptKey =
                                        duplicateResolution.aliases[record.key];
                                    const kept = preparedRecords.find(
                                        item => item.key === keptKey,
                                    );

                                    return (
                                        <div
                                            key={record.key}
                                            className="space-y-1 border-t border-border pt-2"
                                        >
                                            <p className="break-words">
                                                {record.fileName}
                                                {" / "}
                                                {record.sheetName}
                                                {" — რიგი "}
                                                {record.rowNumber}
                                            </p>

                                            {kept && (
                                                <p className="break-words text-text-secondary">
                                                    დატოვებულია:{" "}
                                                    {kept.fileName}
                                                    {" / "}
                                                    {kept.sheetName}
                                                    {" — რიგი "}
                                                    {kept.rowNumber}
                                                </p>
                                            )}
                                        </div>
                                    );
                                },
                            )}
                        </section>
                    )}

                    {ready.length > 0 && (
                        <button
                            type="button"
                            aria-expanded={showReadyProducts}
                            onClick={() =>
                                setShowReadyProducts(current => !current)
                            }
                            className="min-h-11 rounded-xl border border-border px-3 text-sm"
                        >
                            {showReadyProducts
                                ? "გამართული პროდუქტების დამალვა"
                                : `პროდუქტების ნახვა და რედაქტირება (${ready.length})`}
                        </button>
                    )}

                    <div className="max-h-[40rem] space-y-5 overflow-y-auto">
                        {groups.map(group => {
                            if (
                                group.every(
                                    record => record.status === "READY",
                                ) &&
                                !showReadyProducts &&
                                !group.some(
                                    record => record.key === editingKey,
                                )
                            ) {
                                return null;
                            }

                            if (group.length === 1) {
                                return (
                                    <div key={group[0].key}>
                                        {renderCard(group[0], false)}
                                    </div>
                                );
                            }

                            return (
                                <section key={group[0].key} className="space-y-3">
                                    <div className="space-y-1 text-sm">
                                        <h3 className="font-semibold text-danger">
                                            დაკავშირებული შესაძლო
                                            დამთხვევები — {group.length}
                                        </h3>
                                        <p className="text-text-secondary">
                                            კოდით ან სახელისა და
                                            ვარიანტის მონაცემებით
                                            დაკავშირებული ჩანაწერები.
                                            ეს ჯერ ერთ პროდუქტად
                                            გაერთიანებას არ ნიშნავს.
                                        </p>
                                    </div>

                                    <div className="ml-1 border-l-2 border-danger/40 py-1 sm:ml-2">
                                        {group.map(record => (
                                            <div
                                                key={record.key}
                                                className="relative py-2 pl-5 sm:pl-7"
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute left-0 top-8 w-5 border-t-2 border-danger/40 sm:w-7"
                                                />
                                                {renderCard(record, true)}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {records.length === 0 &&
                        result.mappingProblems.length === 0 && (
                            <p className="text-sm text-text-secondary">
                                არჩეულ სვეტებში პროდუქტის ჩანაწერები
                                ვერ ვიპოვეთ. გადაამოწმე სათაურების
                                რიგი და სვეტების არჩევანი.
                            </p>
                        )}

                    {excludedRecords.length > 0 && (
                        <section className="space-y-3 border-t border-border pt-4">
                            <h3 className="font-semibold">
                                გამოტოვებული პროდუქტები
                            </h3>

                            <p className="text-sm text-text-secondary">
                                ეს ჩანაწერები პროდუქტებისა და მარაგის იმპორტში
                                არ შევა. მათი საწყისი მონაცემები შენარჩუნებულია.
                                დაკავშირებული შეკვეთებისა და პარტიების საკითხი
                                ცალკე იქნება გადასაწყვეტი.
                            </p>

                            <div className="max-h-72 space-y-3 overflow-y-auto">
                                {excludedRecords.map(record => (
                                    <article
                                        key={record.key}
                                        className="space-y-2 rounded-xl border border-border p-3 text-sm"
                                    >
                                        <p className="break-words font-semibold">
                                            {record.fileName}
                                            {" / "}
                                            {record.sheetName}
                                            {" — რიგი "}
                                            {record.rowNumber}
                                        </p>

                                        {record.data && (
                                            <p className="text-text-secondary">
                                                {record.data.name}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onExcludedChange(
                                                    excludedKeys.filter(
                                                        key => key !== record.key,
                                                    ),
                                                )
                                            }
                                            className="min-h-11 rounded-xl border border-border px-3"
                                        >
                                            იმპორტში დაბრუნება
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    <ExistingProductsCheck
                        autoCheck={autoReview}
                        links={existingLinks}
                        onLinkChange={onExistingLinkChange}
                        queries={records.flatMap(record =>
                            record.status !== "INVALID" && record.data
                                ? [{
                                    key: record.key,
                                    sourceCode: record.data.sourceCode,
                                    name: record.data.name,
                                    brand: record.data.brand,
                                    color: record.data.color,
                                    size: record.data.size,
                                }]
                                : [],
                        )}
                        labels={Object.fromEntries(
                            records.map(record => [
                                record.key,
                                `${record.fileName} / ${record.sheetName} — რიგი ${record.rowNumber}`,
                            ]),
                        )}
                        onChecked={onProductsChecked}
                    />

                    <ProductImportPlan
                        stockDate={stockDate}
                        stockPolicy={stockPolicy}
                        onStockPolicyChange={onStockPolicyChange}
                        records={records}
                        snapshot={productCheckSnapshot}
                        decisions={existingLinks}
                        mappingProblemCount={result.mappingProblems.length}
                    />
                </>
            )}
        </section>
    );
}
