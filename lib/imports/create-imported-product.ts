import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    saveProductAttributes,
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

// გამოიძახება მხოლოდ ავტორიზებულ ტრანზაქციაში,
// Business-ისა და ImportJob-ის დაბლოკვისა და გეგმის გადამოწმების შემდეგ.
export async function createImportedProduct({
    tx,
    businessId,
    jobId,
    item,
    stockDate,
    nextSku,
    photo = null,
    skipPhoto = false,
}: {
    tx: Prisma.TransactionClient;
    businessId: string;
    jobId: string;
    item: ProductImportPlanItem;
    stockDate: string | null;
    nextSku: () => string;
    photo?: SavedImportPhoto | null;
    skipPhoto?: boolean;
}) {
    const record = item.record;
    const data = record.data;

    function fail(message: string): never {
        throw new OrderValidationError(
            `${record.fileName} / ${record.sheetName} — რიგი ${record.rowNumber}: ${message}`,
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
            fail("მიუთითე მარაგის თარიღი.");
        }

        availableAt = new Date(`${date}T00:00:00+04:00`);
    }

    const attributes = await saveProductAttributes(
        tx,
        businessId,
        {
            brand: data.brand ?? "",
            category: data.category ?? "",
            color: data.color ?? "",
            size: data.size ?? "",
        },
    );

    const product = await tx.product.create({
        data: {
            businessId,
            name: data.name,
            description: data.description,
            brand: attributes.brand || null,
            category: attributes.category || null,
        },
        select: { id: true },
    });

    const inventory = await tx.inventoryItem.create({
        data: {
            businessId,
            productId: product.id,
            sku: nextSku(),
            imageUrl: photo?.imageUrl ?? null,
            color: attributes.color || null,
            size: attributes.size || null,
            salePrice,
            pricingMethod: salePrice === null ? null : "MANUAL",
            pricingValue: salePrice,
            currentStock: quantity,
            isActive: true,
        },
        select: { id: true, sku: true },
    });

    // ნულოვანი ჩანაწერიც საჭიროა, რომ მხოლოდ კატალოგის
    // პროდუქტიც გამოჩნდეს მარაგების არსებულ სიაში.
    const lot = await tx.inventoryStockLot.create({
        data: {
            inventoryItemId: inventory.id,
            quantity,
            remainingQuantity: quantity,
            unitCost,
            remainingCost,
            availableAt,
        },
        select: { id: true },
    });

    if (quantity > 0) {
        await tx.inventoryMovement.create({
            data: {
                inventoryItemId: inventory.id,
                type: "ADJUSTMENT_IN",
                condition: "GOOD",
                quantity,
                createdAt: availableAt,
                note: `იმპორტი ${jobId}; ${record.fileName} / ${record.sheetName}; რიგი ${record.rowNumber}`,
            },
        });
    }

    return {
        productId: product.id,
        inventoryItemId: inventory.id,
        stockLotId: lot.id,
        sku: inventory.sku,
        photoId: photo?.id ?? null,
        photoSkipped: skipPhoto,
        imageUrl: photo?.imageUrl ?? null,
        quantity,
        unitCost: unitCost?.toFixed(2) ?? null,
    };
}