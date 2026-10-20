import "server-only";

import type {
    Prisma,
} from "@/generated/prisma/client";
import {
    prepareDraftProducts,
    type ProductDraftFile,
} from "./prepare-draft-products";
import {
    checkExistingProducts,
} from "./check-existing-products";
import {
    buildProductImportPlan,
} from "./build-product-import-plan";
import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";
import type {
    ImportProductCheckSnapshot,
    ProductMatchQuery,
} from "./match-import-products";

export async function checkDraftProducts({
    prisma,
    businessId,
    files,
    settings,
}: {
    prisma: Pick<Prisma.TransactionClient, "$queryRaw">;
    businessId: string;
    files: readonly ProductDraftFile[];
    settings: ImportDraftSettings;
}) {
    const prepared = prepareDraftProducts({
        files,
        settings,
    });

    const queries: ProductMatchQuery[] =
        prepared.records.flatMap(record => {
            if (
                record.status === "INVALID" ||
                record.data === null
            ) {
                return [];
            }

            return [{
                key: record.key,
                sourceCode: record.data.sourceCode,
                name: record.data.name,
                brand: record.data.brand,
                color: record.data.color,
                size: record.data.size,
            }];
        });

    const results: ImportProductCheckSnapshot["results"] = [];

    for (let offset = 0; offset < queries.length; offset += 100) {
        const batch = queries.slice(offset, offset + 100);

        const checked = await checkExistingProducts({
            prisma,
            businessId,
            queries: batch,
        });

        if (checked.businessId !== businessId) {
            throw new Error(
                "Product check business does not match the draft.",
            );
        }

        results.push(...checked.results);
    }

    const snapshot: ImportProductCheckSnapshot = {
        businessId,
        queries,
        results,
        checkedAt: new Date().toISOString(),
    };

    const plan = buildProductImportPlan({
        records: prepared.records,
        snapshot,
        decisions: settings.existingProductLinks,
        stockPolicy: settings.productStockPolicy,
        stockDate: settings.productStockDate,
    });

    return {
        prepared,
        snapshot,
        plan,
    };
}