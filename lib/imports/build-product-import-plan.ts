import type {
    PreparedImportProduct,
} from "./prepare-import-products";
import type {
    ImportProductCheckSnapshot,
    ProductMatchQuery,
} from "./match-import-products";
import {
    productMatchQueryToken,
    type ImportExistingProductLinks,
} from "./product-import-links";
import {
    calculateImportedStock,
    type ProductStockPolicy,
} from "./product-stock-policy";
import {
    validateProductStockDate,
} from "./product-stock-date";

type ReasonCode =
    | "WAITING_FOR_CHECK"
    | "DATA"
    | "DUPLICATE"
    | "CHECK_INCOMPLETE"
    | "DECISION"
    | "MULTIPLE_STOCK_SOURCES"
    | "STOCK_POLICY"
    | "STOCK_QUANTITY"
    | "STOCK_DATE"
    | null;

export type ProductImportPlanItem = {
    record: PreparedImportProduct;
    action: "CREATE" | "LINK" | "BLOCKED";
    inventoryItemId: string | null;
    reasonCode: ReasonCode;
    reason: string;
    stockReviewRequired: boolean;
    unknownUnitCost: boolean;
};

function queryFor(
    record: PreparedImportProduct,
): ProductMatchQuery | null {
    if (!record.data || record.status === "INVALID") return null;

    return {
        key: record.key,
        sourceCode: record.data.sourceCode,
        name: record.data.name,
        brand: record.data.brand,
        color: record.data.color,
        size: record.data.size,
    };
}

export function buildProductImportPlan({
    records,
    snapshot,
    decisions,
    stockPolicy = null,
    stockDate = null,
}: {
    records: readonly PreparedImportProduct[];
    snapshot: ImportProductCheckSnapshot | null;
    decisions: ImportExistingProductLinks;
    stockPolicy?: ProductStockPolicy | null;
    stockDate?: string | null;
}) {
    const queries = records.flatMap(record => {
        const query = queryFor(record);
        return query ? [query] : [];
    });

    const checkedQueries = new Map(
        snapshot?.queries.map(query => [
            query.key,
            productMatchQueryToken(query),
        ]) ?? [],
    );

    const results = new Map(
        snapshot?.results.map(result => [result.key, result]) ?? [],
    );

    const checkCurrent =
        snapshot !== null &&
        snapshot.queries.length === queries.length &&
        snapshot.results.length === queries.length &&
        queries.every(query =>
            checkedQueries.get(query.key) === productMatchQueryToken(query) &&
            results.has(query.key),
        );

    const items = records.map(
        (record): ProductImportPlanItem => {
            const data = record.data;

            function item(
                action: ProductImportPlanItem["action"],
                reason: string,
                reasonCode: ReasonCode = null,
                inventoryItemId: string | null = null,
            ): ProductImportPlanItem {
                const stockReviewRequired =
                    action !== "BLOCKED" &&
                    record.mode === "CURRENT_STOCK" &&
                    data?.currentStock !== null &&
                    data?.currentStock !== undefined &&
                    !(
                        action === "LINK" &&
                        stockPolicy === "KEEP_EXISTING"
                    );

                return {
                    record,
                    action,
                    inventoryItemId,
                    reasonCode,
                    reason,
                    stockReviewRequired,
                    unknownUnitCost:
                        stockReviewRequired &&
                        (data?.currentStock ?? 0) > 0 &&
                        data?.unitCost === null,
                };
            }

            if (record.status === "INVALID" || !data) {
                return item(
                    "BLOCKED",
                    record.issues
                        .filter(issue => issue.severity === "ERROR")
                        .map(issue => issue.message)
                        .join(" ") ||
                    "პროდუქტის სავალდებულო მონაცემები შესასწორებელია.",
                    "DATA",
                );
            }

            if (record.status === "NEEDS_REVIEW") {
                return item(
                    "BLOCKED",
                    "ატვირთულ მონაცემებში შესაძლო განმეორებაა. ჩანაწერების კავშირი უნდა გადაწყდეს, რომ პროდუქტი ან რაოდენობა ორჯერ არ დაემატოს.",
                    "DUPLICATE",
                );
            }

            const query = queryFor(record);

            if (!checkCurrent || !snapshot || !query) {
                return item(
                    "BLOCKED",
                    "არსებულ პროდუქტებთან შედარება ჯერ დასასრულებელია.",
                    "WAITING_FOR_CHECK",
                );
            }

            const result = results.get(record.key);

            if (!result || !result.complete) {
                return item(
                    "BLOCKED",
                    "კანდიდატების ძებნა არასრულია. პროდუქტის შექმნის ან დაკავშირების დასადასტურებლად დამატებითი შემოწმებაა საჭირო.",
                    "CHECK_INCOMPLETE",
                );
            }

            const decision = decisions[record.key];

            if (
                decision &&
                (
                    decision.businessId !== snapshot.businessId ||
                    decision.queryToken !== productMatchQueryToken(query)
                )
            ) {
                return item(
                    "BLOCKED",
                    "პროდუქტის მონაცემები შეიცვალა და ძველი არჩევანი აღარ შეესაბამება. ხელახლა აირჩიე შექმნა ან დაკავშირება.",
                    "DECISION",
                );
            }

            if (decision?.action === "CREATE") {
                return item(
                    "CREATE",
                    "არჩეულია ცალკე ახალი პროდუქტის შექმნა. MARTEO ახალ კოდს მიანიჭებს.",
                );
            }

            if (decision?.action === "LINK") {
                const candidate = result.candidates.find(
                    candidate =>
                        candidate.existing.inventoryItemId ===
                        decision.inventoryItemId,
                );

                const existing = candidate?.existing;

                if (
                    !candidate ||
                    !existing ||
                    existing.productId !== decision.productId ||
                    existing.inventoryUpdatedAt !== decision.inventoryUpdatedAt ||
                    existing.productUpdatedAt !== decision.productUpdatedAt
                ) {
                    return item(
                        "BLOCKED",
                        "არჩეული არსებული ვარიანტი შეიცვალა ან დამთხვევებში აღარ არის. გადაამოწმე და ხელახლა აირჩიე კავშირი.",
                        "DECISION",
                    );
                }

                if (!existing.isActive) {
                    return item(
                        "BLOCKED",
                        "არჩეული ვარიანტი არააქტიურია. ავტომატურად არ გავააქტიურებთ - აირჩიე სხვა ვარიანტი ან ცალკე შექმნა.",
                        "DECISION",
                    );
                }

                const hasDifferences =
                    candidate.conflictingFields.length > 0 ||
                    candidate.unspecifiedFields.length > 0;

                if (
                    hasDifferences &&
                    !decision.acknowledgedDifferences
                ) {
                    return item(
                        "BLOCKED",
                        "მახასიათებლები განსხვავდება ან იმპორტის ჩანაწერში აკლია. განსხვავებები გადაამოწმე და კავშირი ხელახლა დაადასტურე.",
                        "DECISION",
                    );
                }

                return item(
                    "LINK",
                    "დაუკავშირდება არსებულ ვარიანტს. მისი მონაცემები და ფასი ავტომატურად არ გადაიწერება.",
                    null,
                    existing.inventoryItemId,
                );
            }

            if (result.candidates.length === 0) {
                return item(
                    "CREATE",
                    "შემოწმებით დამთხვევა ვერ მოიძებნა. დაიგეგმება ახალი პროდუქტის შექმნა.",
                );
            }

            return item(
                "BLOCKED",
                "ნაპოვნია არსებული ვარიანტები. აირჩიე დაკავშირება ან დაადასტურე, რომ ეს ცალკე ახალი პროდუქტია.",
                "DECISION",
            );
        },
    );

    const linkedStockSources = new Map<
        string,
        ProductImportPlanItem[]
    >();

    for (const item of items) {
        if (
            item.action !== "LINK" ||
            !item.inventoryItemId ||
            item.record.mode !== "CURRENT_STOCK"
        ) {
            continue;
        }

        const group =
            linkedStockSources.get(item.inventoryItemId) ?? [];

        group.push(item);
        linkedStockSources.set(item.inventoryItemId, group);
    }

    for (const group of linkedStockSources.values()) {
        if (
            group.length < 2 ||
            stockPolicy === "KEEP_EXISTING"
        ) {
            continue;
        }

        for (const item of group) {
            item.action = "BLOCKED";
            item.reasonCode = "MULTIPLE_STOCK_SOURCES";
            item.reason =
                "ამავე არსებულ ვარიანტზე რამდენიმე რიგიდან გადმოგაქვს მიმდინარე ნაშთი. რაოდენობებს ავტომატურად ვერ შევკრებთ: შესაძლოა ერთი და იგივე მარაგი მეორდებოდეს. დატოვე ერთი ნაშთის ჩანაწერი, გაასწორე მასში საბოლოო რაოდენობა და დანარჩენი გამოტოვე. თუ სხვადასხვა პროდუქტებია, შეცვალე მათი დაკავშირება.";
            item.stockReviewRequired = false;
            item.unknownUnitCost = false;
        }
    }

    if (stockPolicy !== null) {
        for (const item of items) {
            const importedStock = item.record.data?.currentStock;

            if (
                item.action !== "LINK" ||
                item.record.mode !== "CURRENT_STOCK" ||
                importedStock === null ||
                importedStock === undefined
            ) {
                continue;
            }

            const existing = results
                .get(item.record.key)
                ?.candidates.find(
                    candidate =>
                        candidate.existing.inventoryItemId ===
                        item.inventoryItemId,
                )?.existing;

            try {
                if (!existing) {
                    throw new Error(
                        "არსებული პროდუქტის ნაშთი ვერ დადასტურდა. ხელახლა გაუშვი პროდუქტების შემოწმება.",
                    );
                }

                calculateImportedStock({
                    existingStock: existing.currentStock,
                    importedStock,
                    policy: stockPolicy,
                });
            } catch (error) {
                item.action = "BLOCKED";
                item.reasonCode = "STOCK_QUANTITY";
                item.reason =
                    error instanceof Error
                        ? error.message
                        : "საბოლოო ნაშთის გამოთვლა ვერ დასრულდა.";
                item.stockReviewRequired = false;
                item.unknownUnitCost = false;
            }
        }
    }

    if (stockPolicy === null) {
        for (const item of items) {
            if (
                item.action !== "LINK" ||
                item.record.mode !== "CURRENT_STOCK" ||
                item.record.data?.currentStock === null ||
                item.record.data?.currentStock === undefined
            ) {
                continue;
            }

            item.action = "BLOCKED";
            item.reasonCode = "STOCK_POLICY";
            item.reason =
                "აირჩიე, ფაილის რაოდენობა დაემატოს არსებულ ნაშთს, გახდეს მიმდინარე ნაშთი თუ რაოდენობა უცვლელი დარჩეს.";
        }
    }

    let stockDateIssue: string | null = null;

    try {
        if (validateProductStockDate(stockDate) === null) {
            stockDateIssue =
                "მარაგის გადმოტანისთვის მიუთითე, რომელ თარიღს ეხება ეს რაოდენობები.";
        }
    } catch (error) {
        stockDateIssue =
            error instanceof Error
                ? error.message
                : "მარაგის თარიღი გადასამოწმებელია.";
    }

    if (stockDateIssue !== null) {
        for (const item of items) {
            if (
                item.action === "BLOCKED" ||
                !item.stockReviewRequired
            ) {
                continue;
            }

            item.action = "BLOCKED";
            item.reasonCode = "STOCK_DATE";
            item.reason = stockDateIssue;
        }
    }

    return {
        items,
        createCount: items.filter(item => item.action === "CREATE").length,
        linkCount: items.filter(item => item.action === "LINK").length,
        waitingCount: items.filter(
            item => item.reasonCode === "WAITING_FOR_CHECK",
        ).length,
        problems: items.filter(
            item =>
                item.action === "BLOCKED" &&
                item.reasonCode !== "WAITING_FOR_CHECK",
        ),
        stockReviewCount: items.filter(
            item => item.stockReviewRequired,
        ).length,
        unknownCostCount: items.filter(
            item => item.unknownUnitCost,
        ).length,
    };
}