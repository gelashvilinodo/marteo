import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    matchImportProductCandidates,
    normalizeProductMatchText,
    type ExistingImportProduct,
    type ImportProductCheckSnapshot,
    type ProductMatchQuery,
} from "./match-import-products";

type ProductReader = Pick<
    Prisma.TransactionClient,
    "$queryRaw"
>;

type DatabaseProduct = Omit<
    ExistingImportProduct,
    "inventoryUpdatedAt" | "productUpdatedAt"
> & {
    inventoryUpdatedAt: Date;
    productUpdatedAt: Date;
};

export async function checkExistingProducts({
    prisma,
    businessId,
    queries,
}: {
    prisma: ProductReader;
    businessId: string;
    queries: readonly ProductMatchQuery[];
}): Promise<ImportProductCheckSnapshot> {
    if (!businessId.trim()) {
        throw new Error("Product check requires a business.");
    }

    if (queries.length > 100) {
        throw new Error(
            "Product check accepts at most 100 queries per batch.",
        );
    }

    const keys = new Set<string>();

    for (const query of queries) {
        if (
            !query.key ||
            !query.name.trim() ||
            keys.has(query.key)
        ) {
            throw new Error(
                "Product check query is empty or duplicated.",
            );
        }

        keys.add(query.key);
    }

    if (queries.length === 0) {
        return {
            businessId,
            queries: [],
            results: [],
            checkedAt: new Date().toISOString(),
        };
    }

    const names = [
        ...new Set(
            queries.map(query =>
                normalizeProductMatchText(query.name),
            ),
        ),
    ];

    const codes = [
        ...new Set(
            queries.flatMap(query =>
                query.sourceCode ? [query.sourceCode] : [],
            ),
        ),
    ];

    const codeCondition =
        codes.length > 0
            ? Prisma.sql`i."sku" IN (${Prisma.join(codes)})`
            : Prisma.sql`FALSE`;

    const whitespace = [
        9, 10, 11, 12, 13, 32, 160, 5760,
        8192, 8193, 8194, 8195, 8196, 8197,
        8198, 8199, 8200, 8201, 8202,
        8232, 8233, 8239, 8287, 12288, 65279,
    ];

    const whitespacePattern =
        `[${whitespace
            .map(code => String.fromCharCode(code))
            .join("")}]+`;

    const rows = await prisma.$queryRaw<DatabaseProduct[]>(
        Prisma.sql`
            SELECT
                i."id" AS "inventoryItemId",
                p."id" AS "productId",
                i."sku",
                p."name",
                p."brand",
                p."category",
                i."color",
                i."size",
                i."salePrice"::text AS "salePrice",
                i."currentStock",
                i."isActive",
                i."updatedAt" AS "inventoryUpdatedAt",
                p."updatedAt" AS "productUpdatedAt"
            FROM "InventoryItem" i
            INNER JOIN "Product" p
                ON p."id" = i."productId"
            WHERE
                i."businessId" = ${businessId}
                AND p."businessId" = ${businessId}
                AND (
                    ${codeCondition}
                    OR btrim(
                        lower(
                            regexp_replace(
                                normalize(p."name", NFC),
                                ${whitespacePattern},
                                ' ',
                                'g'
                            )
                        )
                    ) IN (${Prisma.join(names)})
                )
            ORDER BY i."id" ASC
            LIMIT 2001
        `,
    );

    const searchComplete = rows.length <= 2000;

    const existingProducts: ExistingImportProduct[] =
        rows.slice(0, 2000).map(row => ({
            ...row,
            inventoryUpdatedAt:
                row.inventoryUpdatedAt.toISOString(),
            productUpdatedAt:
                row.productUpdatedAt.toISOString(),
        }));

    return {
        businessId,
        queries: [...queries],
        results: queries.map(query => {
            const candidates = matchImportProductCandidates(
                query,
                existingProducts,
            );

            return {
                key: query.key,
                candidates: candidates.slice(0, 20),
                complete:
                    searchComplete &&
                    candidates.length <= 20,
            };
        }),
        checkedAt: new Date().toISOString(),
    };
}