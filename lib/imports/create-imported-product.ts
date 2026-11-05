import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    saveProductAttributesBatch,
} from "@/lib/purchases/save-product-attributes";
import type {
    ProductImportPlanItem,
} from "./build-product-import-plan";
import {
    validateProductStockDate,
} from "./product-stock-date";
import type {
    SavedImportPhoto,
} from "./read-saved-import-photos";

export type ImportedProductInput = {
    item: ProductImportPlanItem;
    photo: SavedImportPhoto | null;
    skipPhoto: boolean;
};

// ბაზასთან შეხების გარეშე ამოწმებს და ამზადებს ერთ პროდუქტს.
function checkImportedProduct({
    businessId,
    item,
    stockDate,
    photo,
    skipPhoto,
}: ImportedProductInput & {
    businessId: string;
    stockDate: string | null;
}) {
    const record = item.record;
    const data = record.data;

    function fail(message: string): never {
        throw new OrderValidationError(
            `${record.fileName} / ${record.sheetName} - რიგი ${record.rowNumber}: ${message}`,
            422,
        );
    }

    if (
        item.action !== "CREATE" ||
        record.status !== "READY" ||
        data === null
    ) {
        fail("პროდუქტის შექმნა ჯერ დადასტურებული არ არის.");
    }

    if (skipPhoto && photo !== null) {
        fail(
            "ფოტოს გამოყენება და გამოტოვება ერთდროულად ვერ დადასტურდება.",
        );
    }

    if (photo !== null) {
        const pathParts = photo.storagePath.split("/");

        if (
            photo.sheetName !== record.sheetName ||
            photo.rowNumber !== record.rowNumber ||
            pathParts.length !== 2 ||
            pathParts[0] !== businessId ||
            !/^[0-9a-f-]{36}(\.full)?\.(png|jpg|webp)$/.test(
                pathParts[1],
            ) ||
            photo.imageUrl !==
            "https://uwxmbyweyvnekzzecroz.supabase.co" +
            "/storage/v1/object/public/product-images/" +
            photo.storagePath
        ) {
            fail(
                "შენახული ფოტო ამ პროდუქტის რიგს ან ბიზნესს არ ემთხვევა.",
            );
        }
    }

    if (
        data.imageReference !== null &&
        photo === null &&
        !skipPhoto
    ) {
        fail(
            "ფოტოს მითითება არსებობს, მაგრამ შესაბამისი შენახული ფოტო ვერ მოიძებნა. საჭიროა ფოტოს დამატება ან გამოტოვების დადასტურება.",
        );
    }

    const quantity =
        record.mode === "CURRENT_STOCK"
            ? data.currentStock
            : 0;

    if (
        quantity === null ||
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > 2_147_483_647
    ) {
        fail("მარაგის რაოდენობა არასწორია.");
    }

    function money(
        value: string | null,
        label: string,
    ): Prisma.Decimal | null {
        if (value === null) return null;

        if (!/^\d+\.\d{2}$/.test(value)) {
            fail(`${label}: თანხის ფორმატი არასწორია.`);
        }

        const amount = new Prisma.Decimal(value);

        if (
            !amount.isFinite() ||
            amount.isNegative() ||
            amount.gt("9999999999.99")
        ) {
            fail(`${label}: თანხა დასაშვებ ზღვარს აღემატება.`);
        }

        return amount;
    }

    const unitCost = money(data.unitCost, "თვითღირებულება");
    const salePrice = money(data.salePrice, "გასაყიდი ფასი");

    const remainingCost =
        quantity === 0
            ? new Prisma.Decimal(0)
            : unitCost === null
                ? null
                : unitCost.mul(quantity);

    if (
        remainingCost !== null &&
        remainingCost.gt("9999999999999999.99")
    ) {
        fail("მარაგის სრული ღირებულება ბაზის თანხის ველში ვერ მოთავსდება.");
    }

    let availableAt = new Date();

    if (record.mode === "CURRENT_STOCK") {
        let date: string | null;

        try {
            date = validateProductStockDate(stockDate);
        } catch {
            fail("მარაგის თარიღი არასწორია.");
        }

        if (date === null) {
            fail("მიუთითეთ მარაგის თარიღი.");
        }

        availableAt = new Date(`${date}T00:00:00+04:00`);
    }

    return {
        record,
        data,
        photo,
        skipPhoto,
        quantity,
        unitCost,
        salePrice,
        remainingCost,
        availableAt,
    };
}

// გამოიძახება მხოლოდ ავტორიზებულ ტრანზაქციაში,
// Business-ისა და ImportJob-ის დაბლოკვისა და გეგმის გადამოწმების შემდეგ.
// ყველა პროდუქტს ჯგუფურად წერს, რომ დიდი ფაილი ტაიმაუტზე არ გავიდეს.
export async function createImportedProducts({
    tx,
    businessId,
    jobId,
    products,
    stockDate,
    nextSku,
}: {
    tx: Prisma.TransactionClient;
    businessId: string;
    jobId: string;
    products: readonly ImportedProductInput[];
    stockDate: string | null;
    nextSku: () => string;
}) {
    const checked = products.map(input =>
        checkImportedProduct({ ...input, businessId, stockDate }),
    );

    const attributes = await saveProductAttributesBatch(
        tx,
        businessId,
        checked.map(({ data }) => ({
            brand: data.brand ?? "",
            category: data.category ?? "",
            color: data.color ?? "",
            size: data.size ?? "",
        })),
    );

    const rows = checked.map((entry, index) => ({
        ...entry,
        attributes: attributes[index],
        productId: crypto.randomUUID(),
        inventoryItemId: crypto.randomUUID(),
        stockLotId: crypto.randomUUID(),
        sku: nextSku(),
    }));

    for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);

        await tx.product.createMany({
            data: chunk.map(row => ({
                id: row.productId,
                businessId,
                name: row.data.name,
                description: row.data.description,
                brand: row.attributes.brand || null,
                category: row.attributes.category || null,
            })),
        });

        await tx.inventoryItem.createMany({
            data: chunk.map(row => ({
                id: row.inventoryItemId,
                businessId,
                productId: row.productId,
                sku: row.sku,
                imageUrl: row.photo?.imageUrl ?? null,
                color: row.attributes.color || null,
                size: row.attributes.size || null,
                salePrice: row.salePrice,
                pricingMethod: row.salePrice === null ? null : "MANUAL" as const,
                pricingValue: row.salePrice,
                currentStock: row.quantity,
                isActive: true,
            })),
        });

        // ნულოვანი ჩანაწერიც საჭიროა, რომ მხოლოდ კატალოგის
        // პროდუქტიც გამოჩნდეს მარაგების არსებულ სიაში.
        await tx.inventoryStockLot.createMany({
            data: chunk.map(row => ({
                id: row.stockLotId,
                inventoryItemId: row.inventoryItemId,
                quantity: row.quantity,
                remainingQuantity: row.quantity,
                unitCost: row.unitCost,
                remainingCost: row.remainingCost,
                availableAt: row.availableAt,
            })),
        });

        const movements = chunk.filter(row => row.quantity > 0);

        if (movements.length > 0) {
            await tx.inventoryMovement.createMany({
                data: movements.map(row => ({
                    inventoryItemId: row.inventoryItemId,
                    type: "ADJUSTMENT_IN" as const,
                    condition: "GOOD" as const,
                    quantity: row.quantity,
                    createdAt: row.availableAt,
                    note: `იმპორტი ${jobId}; ${row.record.fileName} / ${row.record.sheetName}; რიგი ${row.record.rowNumber}`,
                })),
            });
        }
    }

    return rows.map(row => ({
        productId: row.productId,
        inventoryItemId: row.inventoryItemId,
        stockLotId: row.stockLotId,
        sku: row.sku,
        photoId: row.photo?.id ?? null,
        photoSkipped: row.skipPhoto,
        imageUrl: row.photo?.imageUrl ?? null,
        quantity: row.quantity,
        unitCost: row.unitCost?.toFixed(2) ?? null,
    }));
}
