import {
    buildProductImportPlan,
} from "@/lib/imports/build-product-import-plan";

import type {
    PreparedImportProduct,
} from "@/lib/imports/prepare-import-products";

import type {
    ImportProductCheckSnapshot,
} from "@/lib/imports/match-import-products";

import type {
    ImportExistingProductLinks,
} from "@/lib/imports/product-import-links";

import ProductStockPolicyPicker from "./ProductStockPolicyPicker";

import {
    calculateImportedStock,
    type ProductStockPolicy,
} from "@/lib/imports/product-stock-policy";

import {
    validateProductStockDate,
} from "@/lib/imports/product-stock-date";

export default function ProductImportPlan({
    records,
    snapshot,
    decisions,
    mappingProblemCount,
    stockPolicy,
    onStockPolicyChange,
    stockDate,
}: {
    stockDate: string | null;
    stockPolicy: ProductStockPolicy | null;
    onStockPolicyChange: (
        policy: ProductStockPolicy | null,
    ) => void;
    records: PreparedImportProduct[];
    snapshot: ImportProductCheckSnapshot | null;
    decisions: ImportExistingProductLinks;
    mappingProblemCount: number;
}) {
    const plan = buildProductImportPlan({
        records,
        snapshot,
        decisions,
        stockPolicy,
        stockDate,
    });

    const linkedStockItems = plan.items.filter(
        item =>
            (
                item.action === "LINK" ||
                item.reasonCode === "STOCK_POLICY" ||
                item.reasonCode === "MULTIPLE_STOCK_SOURCES" ||
                item.reasonCode === "STOCK_QUANTITY" ||
                item.reasonCode === "STOCK_DATE"
            ) &&
            item.inventoryItemId !== null &&
            item.record.mode === "CURRENT_STOCK" &&
            item.record.data?.currentStock !== null &&
            item.record.data?.currentStock !== undefined,
    );

    let stockDateConfirmed = false;

    try {
        stockDateConfirmed =
            validateProductStockDate(stockDate) !== null;
    } catch {
        stockDateConfirmed = false;
    }

    const detailedProblems = plan.problems.filter(
        item =>
            item.reasonCode !== "STOCK_POLICY" &&
            item.reasonCode !== "STOCK_DATE",
    );

    const stockPreviews = linkedStockItems.map(item => {
        const result = snapshot?.results.find(
            result => result.key === item.record.key,
        );

        const existing = result?.candidates.find(
            candidate =>
                candidate.existing.inventoryItemId ===
                item.inventoryItemId,
        )?.existing;

        const importedStock = item.record.data?.currentStock;

        if (
            !existing ||
            importedStock === null ||
            importedStock === undefined ||
            stockPolicy === null
        ) {
            return {
                item,
                change: null,
                error: null,
            };
        }

        try {
            return {
                item,
                change: calculateImportedStock({
                    existingStock: existing.currentStock,
                    importedStock,
                    policy: stockPolicy,
                }),
                error: null,
            };
        } catch (error) {
            return {
                item,
                change: null,
                error:
                    error instanceof Error
                        ? error.message
                        : "ნაშთის გამოთვლა ვერ დასრულდა.",
            };
        }
    });

    return (
        <section className="space-y-3 border-t border-border pt-4">
            <h3 className="font-semibold">
                პროდუქტების იმპორტის გეგმა
            </h3>

            <div
                role="status"
                className="grid gap-3 text-sm sm:grid-cols-3"
            >
                <div className="rounded-xl border border-border p-3">
                    <p className="text-text-secondary">ახალი ჩანაწერი</p>
                    <p className="mt-1 text-xl font-semibold">
                        {plan.createCount}
                    </p>
                </div>

                <div className="rounded-xl border border-border p-3">
                    <p className="text-text-secondary">არსებულთან კავშირი</p>
                    <p className="mt-1 text-xl font-semibold">
                        {plan.linkCount}
                    </p>
                </div>

                <div className="rounded-xl border border-border p-3">
                    <p className="text-text-secondary">გადასაწყვეტი</p>
                    <p className="mt-1 text-xl font-semibold">
                        {plan.problems.length}
                    </p>
                </div>
            </div>

            {plan.waitingCount > 0 && (
                <p className="text-sm text-text-secondary">
                    არსებული პროდუქტების შემოწმება ჯერ დასასრულებელია.
                    გაუშვი შემოწმება ზემოთ მდებარე ღილაკით.
                    ეს ჩანაწერების შეცდომა არ არის.
                </p>
            )}

            {mappingProblemCount > 0 && (
                <p className="text-sm text-danger">
                    {mappingProblemCount} ფურცელზე სვეტები
                    დასაკავშირებელია. მათი ჩანაწერები გეგმაში ჯერ არ შედის.
                </p>
            )}

            {plan.stockReviewCount > 0 && (
                <p className="text-sm text-text-secondary">
                    მარაგის გადმოტანა შეეხება{" "}
                    {plan.stockReviewCount} ჩანაწერს.
                    {stockDateConfirmed && (
                        <> არჩეული თარიღი: {stockDate}.</>
                    )}
                </p>
            )}

            <ProductStockPolicyPicker
                affectedCount={linkedStockItems.length}
                value={stockPolicy}
                onChange={onStockPolicyChange}
            />

            {plan.stockReviewCount > 0 && !stockDateConfirmed && (
                <p role="status" className="text-sm text-text-secondary">
                    მარაგის გადმოტანის მოსამზადებლად მიუთითე
                    სწორი თარიღი ზემოთ. თითოეულ პროდუქტზე
                    ცალ-ცალკე შევსება საჭირო არ არის.
                </p>
            )}

            {stockPolicy !== null && stockPreviews.length > 0 && (
                <section className="space-y-3">
                    <h4 className="text-sm font-semibold">
                        არსებული ნაშთების ცვლილება
                    </h4>

                    <div className="max-h-80 space-y-3 overflow-y-auto">
                        {stockPreviews.map(({ item, change, error }) => (
                            <article
                                key={item.record.key}
                                className={[
                                    "space-y-2 rounded-xl border p-3 text-sm",
                                    error
                                        ? "border-danger/60"
                                        : "border-border",
                                ].join(" ")}
                            >
                                <p className="break-words font-semibold">
                                    {item.record.data?.name}
                                </p>

                                <p className="break-words text-text-secondary">
                                    {item.record.fileName}
                                    {" / "}
                                    {item.record.sheetName}
                                    {" - რიგი "}
                                    {item.record.rowNumber}
                                </p>

                                {change && (
                                    <>
                                        <p>
                                            არსებული ნაშთი:{" "}
                                            {change.previousStock}
                                        </p>
                                        <p>
                                            ფაილის რაოდენობა:{" "}
                                            {item.record.data?.currentStock}
                                        </p>
                                        <p className="font-semibold">
                                            საბოლოო ნაშთი:{" "}
                                            {change.nextStock}
                                        </p>
                                        <p className="text-text-secondary">
                                            ცვლილება:{" "}
                                            {change.adjustment > 0 ? "+" : ""}
                                            {change.adjustment}
                                        </p>
                                    </>
                                )}

                                {error && (
                                    <p role="alert" className="text-danger">
                                        {error}
                                    </p>
                                )}

                                {!change && !error && (
                                    <p className="text-text-secondary">
                                        არსებული ნაშთის დასადასტურებლად
                                        პროდუქტების შემოწმება ხელახლა გაუშვი.
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>
                </section>
            )}

            {detailedProblems.length > 0 && (
                <div className="max-h-80 space-y-3 overflow-y-auto">
                    {detailedProblems.map(item => (
                        <article
                            key={item.record.key}
                            className="space-y-2 rounded-xl border border-danger/40 p-3 text-sm"
                        >
                            <p className="break-words font-semibold">
                                {item.record.fileName}
                                {" / "}
                                {item.record.sheetName}
                                {" - რიგი "}
                                {item.record.rowNumber}
                            </p>

                            {item.record.data && (
                                <p>{item.record.data.name}</p>
                            )}

                            <p>{item.reason}</p>
                        </article>
                    ))}
                </div>
            )}

            <p className="text-xs text-text-secondary">
                ეს წინასწარი გეგმაა. გამოტოვებული ჩანაწერები
                მასში არ შედის. პროდუქტები და მარაგი ჯერ არ ინახება.
                საბოლოო შენახვამდე მონაცემები სერვერზეც
                ხელახლა შემოწმდება.
            </p>
        </section>
    );
}
