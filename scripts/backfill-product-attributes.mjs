import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

function cleanName(value) {
    return String(value ?? "")
        .normalize("NFC")
        .replace(/\s+/gu, " ")
        .trim();
}

function normalizeName(value) {
    return cleanName(value)
        .normalize("NFKC")
        .toLowerCase();
}

async function main() {
    const connectionString = process.env.DIRECT_URL;

    if (!connectionString) {
        throw new Error("DIRECT_URL_MISSING");
    }

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 15000,
    });

    let transactionStarted = false;

    try {
        await client.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        const { rows } = await client.query(`
            SELECT
                "businessId",
                'CATEGORY' AS "type",
                "category" AS "name"
            FROM "Product"
            WHERE "category" IS NOT NULL

            UNION ALL

            SELECT
                "businessId",
                'BRAND' AS "type",
                "brand" AS "name"
            FROM "Product"
            WHERE "brand" IS NOT NULL

            UNION ALL

            SELECT
                "businessId",
                'COLOR' AS "type",
                "color" AS "name"
            FROM "InventoryItem"
            WHERE "color" IS NOT NULL

            UNION ALL

            SELECT
                "businessId",
                'SIZE' AS "type",
                "size" AS "name"
            FROM "InventoryItem"
            WHERE "size" IS NOT NULL

            ORDER BY "businessId", "type", "name"
        `);

        const seen = new Set();

        const inserted = {
            CATEGORY: 0,
            BRAND: 0,
            COLOR: 0,
            SIZE: 0,
        };

        for (const row of rows) {
            const name = cleanName(row.name);
            const normalizedName = normalizeName(name);

            if (!normalizedName) continue;

            const key = JSON.stringify([
                row.businessId,
                row.type,
                normalizedName,
            ]);

            if (seen.has(key)) continue;
            seen.add(key);

            const result = await client.query(
                `
                    INSERT INTO "ProductAttribute" (
                        "id",
                        "businessId",
                        "type",
                        "name",
                        "normalizedName",
                        "createdAt",
                        "updatedAt"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3::"ProductAttributeType",
                        $4,
                        $5,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (
                        "businessId",
                        "type",
                        "normalizedName"
                    )
                    DO NOTHING
                `,
                [
                    randomUUID(),
                    row.businessId,
                    row.type,
                    name,
                    normalizedName,
                ],
            );

            inserted[row.type] += result.rowCount ?? 0;
        }

        await client.query("COMMIT");
        transactionStarted = false;

        console.log("სიების შევსება დასრულდა.");
        console.log(`კატეგორიები: ${inserted.CATEGORY}`);
        console.log(`ბრენდები: ${inserted.BRAND}`);
        console.log(`ფერები: ${inserted.COLOR}`);
        console.log(`ზომები: ${inserted.SIZE}`);
    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        throw error;
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error(
        "შევსება ვერ დასრულდა. გადაამოწმე კავშირი და შეცდომის კოდი.",
    );

    console.error(
        "კოდი:",
        error?.code ??
            (error?.message === "DIRECT_URL_MISSING"
                ? "DIRECT_URL_MISSING"
                : "UNKNOWN"),
    );

    process.exitCode = 1;
});