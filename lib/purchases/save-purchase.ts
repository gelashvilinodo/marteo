import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { findActiveMembership } from "@/lib/auth/active-business";

import { createInventorySkuAllocator } from "./create-inventory-sku";


import {
    PurchaseValidationError,
    validatePurchase,
} from "./validate-purchases";

import {
    uploadProductImage,
    removeUncommittedProductImages,
} from "./product-images";

import {
    saveProductAttributesBatch,
    normalizeAttributeName,
} from "./save-product-attributes";

export type PurchaseImageChange =
    | { action: "keep" }
    | { action: "remove" }
    | { action: "upload"; file: File; thumbnail?: File | null };

function fail(message: string): never {
    throw new PurchaseValidationError(message);
}

function normalize(value: string | null | undefined) {
    return (value ?? "").normalize("NFC").trim();
}

function checkedMoney(value: Prisma.Decimal): string {
    const rounded = value.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
    );

    if (
        !rounded.isFinite() ||
        rounded.isNegative() ||
        rounded.greaterThan("9999999999.99")
    ) {
        fail("თანხა დასაშვებ ზღვარს აღემატება.");
    }

    return rounded.toFixed(2);
}

export async function savePurchase(
    value: unknown,
    requestId: string,
    imageChanges: PurchaseImageChange[],
) {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            requestId,
        )
    ) {
        fail("მოთხოვნის კოდი არასწორია.");
    }

    const user = await getCurrentUser();

    if (!user) {
        fail("პარტიის დასამატებლად შედით ანგარიშში.");
    }

    const input = validatePurchase(value);

    if (
        !Array.isArray(imageChanges) ||
        imageChanges.length !== input.items.length
    ) {
        fail("პროდუქტებისა და ფოტოების მონაცემები ერთმანეთს არ ემთხვევა.");
    }

    for (const change of imageChanges) {
        if (
            !change ||
            !["keep", "remove", "upload"].includes(change.action)
        ) {
            fail("ფოტოს მოქმედება არასწორია.");
        }

        if (
            change.action === "upload" &&
            (!(change.file instanceof File) ||
                change.file.size === 0 ||
                change.file.size > 5 * 1024 * 1024)
        ) {
            fail("აირჩიეთ ფოტო, რომლის ზომა მაქსიმუმ 5 MB იქნება.");
        }
    }

    const prisma = createPrismaClient();

    try {
        const membership =
            await findActiveMembership(prisma, user.id);

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.");
        }

        const businessId = membership.businessId;

        const completed = await prisma.purchase.findUnique({
            where: { id: requestId },
            select: {
                id: true,
                number: true,
                businessId: true,
            },
        });

        if (completed) {
            if (completed.businessId !== businessId) {
                fail("მოთხოვნის კოდი უკვე გამოყენებულია.");
            }

            return {
                id: completed.id,
                number: completed.number,
            };
        }

        const uploadedImages = new Map<
            number,
            { path: string; url: string }
        >();

        async function cleanupUploadedImages() {
            const paths = [...uploadedImages.values()].map(
                (image) => image.path,
            );

            if (paths.length === 0) return;

            try {
                await removeUncommittedProductImages(
                    businessId,
                    paths,
                );
            } catch {
                console.error("Unused purchase images need cleanup", {
                    businessId,
                    requestId,
                    paths,
                });
            }
        }

        try {
            for (const [index, change] of imageChanges.entries()) {
                if (change.action !== "upload") continue;

                const uploaded = await uploadProductImage(
                    businessId,
                    change.file,
                    change.thumbnail,
                );

                uploadedImages.set(index, uploaded);
            }
        } catch (error) {
            // ბაზაში შენახვა ჯერ არ დაწყებულა.
            await cleanupUploadedImages();
            throw error;
        }

        let reusedExistingPurchase = false;

        const result = await prisma.$transaction(
            async (tx) => {
                // ერთ ბიზნესში ერთდროული შესყიდვები რიგით სრულდება.
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${businessId}
                    FOR UPDATE
                `;

                const access = await tx.businessMembership.findFirst({
                    where: {
                        userId: user.id,
                        businessId,
                    },
                    select: { id: true },
                });

                if (!access) {
                    fail("ამ ბიზნესზე წვდომა აღარ გაქვთ.");
                }

                // იგივე მოთხოვნის ხელახლა გამოგზავნა
                // მეორე პარტიას აღარ შექმნის.
                const existing = await tx.purchase.findUnique({
                    where: { id: requestId },
                    select: {
                        id: true,
                        number: true,
                        businessId: true,
                    },
                });

                if (existing) {
                    if (existing.businessId !== businessId) {
                        fail("მოთხოვნის კოდი უკვე გამოყენებულია.");
                    }

                    reusedExistingPurchase = true;

                    return {
                        id: existing.id,
                        number: existing.number,
                    };
                }

                const nextInventorySku = await createInventorySkuAllocator(
                    tx,
                    businessId,
                );

                const previous = await tx.purchase.aggregate({
                    where: { businessId },
                    _max: { number: true },
                });

                const isReceived =
                    input.receiptStatus === "RECEIVED";

                const receivedAt = isReceived ? new Date() : null;

                const purchase = await tx.purchase.create({
                    data: {
                        id: requestId,
                        businessId,
                        number: (previous._max.number ?? 0) + 1,
                        name: input.name || null,
                        country: input.country || null,
                        note: input.note || null,
                        receiptStatus: input.receiptStatus,
                        receivedAt,
                        purchaseDate: new Date(
                            `${input.purchaseDate}T00:00:00+04:00`,
                        ),
                        shippingCost: input.calculation.shippingCost,
                        customsCost: input.calculation.customsCost,
                        otherCost: input.calculation.otherCost,
                    },
                });

                // ყველა ხაზი ერთად მზადდება და ბაზაში ჯგუფურად იწერება,
                // რომ დიდი პარტიაც ტრანზაქციის დროში ჩაეტიოს.
                const attributes = await saveProductAttributesBatch(
                    tx,
                    businessId,
                    input.items,
                );

                const items = input.items.map((item, index) => ({
                    ...item,
                    ...attributes[index],
                }));

                const sourceIds = [
                    ...new Set(
                        items.flatMap((item) =>
                            item.sourceInventoryItemId
                                ? [item.sourceInventoryItemId]
                                : [],
                        ),
                    ),
                ];

                const sources = new Map(
                    (sourceIds.length > 0
                        ? await tx.inventoryItem.findMany({
                            where: {
                                id: { in: sourceIds },
                                businessId,
                                isActive: true,
                            },
                            include: { product: true },
                        })
                        : []
                    ).map((source) => [source.id, source]),
                );

                const groupedProducts = new Map<string, string>();
                const newProducts: Prisma.ProductCreateManyInput[] = [];

                const plans = items.map((item, index) => {
                    const source = item.sourceInventoryItemId
                        ? sources.get(item.sourceInventoryItemId) ?? null
                        : null;

                    if (item.sourceInventoryItemId && !source) {
                        fail(
                            `პროდუქტი ${index + 1}: არჩეული მარაგის ჩანაწერი აღარ არის ხელმისაწვდომი.`,
                        );
                    }

                    const sameProduct =
                        source !== null &&
                        normalize(source.product.name) === item.name &&
                        normalizeAttributeName(source.product.brand ?? "") ===
                        normalizeAttributeName(item.brand) &&
                        normalizeAttributeName(source.product.category ?? "") ===
                        normalizeAttributeName(item.category) &&
                        normalize(source.product.description) === item.description;

                    let productId: string;

                    const groupedProductId =
                        !source && item.productGroup
                            ? groupedProducts.get(item.productGroup)
                            : undefined;

                    if (source && sameProduct) {
                        productId = source.productId;
                    } else if (groupedProductId) {
                        productId = groupedProductId;
                    } else {
                        productId = crypto.randomUUID();

                        newProducts.push({
                            id: productId,
                            businessId,
                            name: item.name,
                            brand: item.brand || null,
                            category: item.category,
                            description: item.description || null,
                        });

                        if (!source && item.productGroup) {
                            groupedProducts.set(item.productGroup, productId);
                        }
                    }

                    return { item, source, sameProduct, productId };
                });

                if (newProducts.length > 0) {
                    await tx.product.createMany({ data: newProducts });
                }

                const createdProductIds = new Set(
                    newProducts.map((product) => product.id),
                );

                const existingProductIds = [
                    ...new Set(plans.map((plan) => plan.productId)),
                ].filter((productId) => !createdProductIds.has(productId));

                type VariantState = {
                    id: string;
                    productId: string;
                    color: string | null;
                    size: string | null;
                    imageUrl: string | null;
                    currentStock: number;
                };

                const variantsByProduct = new Map<string, VariantState[]>();
                const variantsById = new Map<string, VariantState>();

                function rememberVariant(variant: VariantState) {
                    const list = variantsByProduct.get(variant.productId) ?? [];

                    list.push(variant);
                    variantsByProduct.set(variant.productId, list);
                    variantsById.set(variant.id, variant);
                }

                const existingVariants = existingProductIds.length > 0
                    ? await tx.inventoryItem.findMany({
                        where: {
                            businessId,
                            productId: { in: existingProductIds },
                        },
                        select: {
                            id: true,
                            productId: true,
                            color: true,
                            size: true,
                            imageUrl: true,
                            currentStock: true,
                        },
                    })
                    : [];

                for (const variant of existingVariants) {
                    rememberVariant({ ...variant });
                }

                const createdInventory = new Map<
                    string,
                    Prisma.InventoryItemCreateManyInput
                >();

                const updatedInventory = new Map<string, {
                    imageUrl: string | null;
                    pricing: {
                        salePrice: string;
                        pricingMethod: string;
                        pricingValue: string;
                    } | null;
                    increment: number;
                }>();

                const purchaseItems: Prisma.PurchaseItemCreateManyInput[] = [];
                const stockLots: Prisma.InventoryStockLotCreateManyInput[] = [];
                const movements: Prisma.InventoryMovementCreateManyInput[] = [];

                // FIFO რიგი createdAt-ით წყდება, ამიტომ ხაზების თანმიმდევრობას ვინარჩუნებთ.
                const createdBase = Date.now();

                for (const [index, plan] of plans.entries()) {
                    const { item, source, sameProduct, productId } = plan;
                    const calculated = input.calculation.items[index];
                    const variants = variantsByProduct.get(productId) ?? [];

                    const exactSource =
                        source &&
                            sameProduct &&
                            normalizeAttributeName(source.color ?? "") ===
                            normalizeAttributeName(item.color) &&
                            normalizeAttributeName(source.size ?? "") ===
                            normalizeAttributeName(item.size)
                            ? variantsById.get(source.id) ?? null
                            : null;

                    const inventory =
                        exactSource ??
                        variants.find(
                            (variant) =>
                                normalizeAttributeName(variant.color ?? "") ===
                                normalizeAttributeName(item.color) &&
                                normalizeAttributeName(variant.size ?? "") ===
                                normalizeAttributeName(item.size),
                        );

                    const cost = new Prisma.Decimal(
                        calculated.finalUnitCost,
                    );

                    const pricingValue = new Prisma.Decimal(
                        item.pricingValue,
                    );

                    let salePrice = pricingValue;

                    if (item.pricingMethod === "FIXED_PROFIT") {
                        salePrice = cost.plus(pricingValue);
                    } else if (item.pricingMethod === "MARKUP_PERCENT") {
                        salePrice = cost.mul(
                            pricingValue.div(100).plus(1),
                        );
                    } else if (item.pricingMethod === "MARGIN_PERCENT") {
                        salePrice = cost.div(
                            new Prisma.Decimal(1).minus(
                                pricingValue.div(100),
                            ),
                        );
                    }

                    const pricingData = {
                        salePrice: checkedMoney(salePrice),
                        pricingMethod: item.pricingMethod,
                        pricingValue: checkedMoney(pricingValue),
                    };

                    checkedMoney(
                        new Prisma.Decimal(
                            calculated.allocatedExtraCostTotal,
                        ),
                    );

                    checkedMoney(cost);

                    const receivedQuantity = isReceived
                        ? calculated.quantity
                        : 0;

                    const receivedDefectiveQuantity = isReceived
                        ? item.defectiveQuantity
                        : 0;

                    const receivedGoodQuantity =
                        receivedQuantity - receivedDefectiveQuantity;

                    if (
                        inventory &&
                        inventory.currentStock + receivedQuantity >
                        2147483647
                    ) {
                        fail(
                            "მარაგის რაოდენობა დასაშვებ ზღვარს აღემატება.",
                        );
                    }

                    const imageChange = imageChanges[index];

                    let imageUrl: string | null;

                    if (imageChange.action === "upload") {
                        const uploaded = uploadedImages.get(index);

                        if (!uploaded) {
                            fail(`პროდუქტი ${index + 1}: ატვირთული ფოტო ვერ მოიძებნა.`);
                        }

                        imageUrl = uploaded.url;
                    } else if (imageChange.action === "remove") {
                        imageUrl = null;
                    } else {
                        // არსებული ვარიანტის ფოტოს ვინარჩუნებთ.
                        // ახალი ვარიანტი საწყისი პროდუქტის ფოტოს იღებს.
                        imageUrl = inventory
                            ? inventory.imageUrl
                            : source
                                ? variantsById.get(source.id)?.imageUrl ??
                                source.imageUrl
                                : null;
                    }

                    let inventoryItemId: string;

                    if (inventory) {
                        inventoryItemId = inventory.id;
                        inventory.imageUrl = imageUrl;
                        inventory.currentStock += receivedQuantity;

                        const created = createdInventory.get(inventory.id);

                        if (created) {
                            // ამავე პარტიაში შექმნილ ვარიანტს ჩანაწერშივე ვასწორებთ.
                            created.imageUrl = imageUrl;

                            if (isReceived) {
                                Object.assign(created, pricingData);
                                created.currentStock = inventory.currentStock;
                            }
                        } else {
                            const previous = updatedInventory.get(inventory.id);

                            updatedInventory.set(inventory.id, {
                                imageUrl,

                                // გზაში მყოფი პარტია არსებული
                                // მარაგის ფასსა და ნაშთს არ ცვლის.
                                pricing: isReceived
                                    ? pricingData
                                    : previous?.pricing ?? null,
                                increment:
                                    (previous?.increment ?? 0) +
                                    receivedQuantity,
                            });
                        }
                    } else {
                        inventoryItemId = crypto.randomUUID();

                        createdInventory.set(inventoryItemId, {
                            id: inventoryItemId,
                            businessId,
                            productId,
                            sku: nextInventorySku(),
                            color: item.color || null,
                            size: item.size || null,
                            imageUrl,

                            // ახალი პროდუქტის ჩანაწერი იქმნება,
                            // მაგრამ მიღებამდე ნაშთი ნულია.
                            currentStock: receivedQuantity,

                            ...(isReceived ? pricingData : {}),
                        });

                        rememberVariant({
                            id: inventoryItemId,
                            productId,
                            color: item.color || null,
                            size: item.size || null,
                            imageUrl,
                            currentStock: receivedQuantity,
                        });
                    }

                    const purchaseItemId = crypto.randomUUID();
                    const createdAt = new Date(createdBase + index);

                    const remainingCost = isReceived
                        ? new Prisma.Decimal(calculated.unitPurchasePrice)
                            .mul(calculated.quantity)
                            .plus(calculated.allocatedExtraCostTotal)
                        : new Prisma.Decimal(0);

                    purchaseItems.push({
                        id: purchaseItemId,
                        purchaseId: purchase.id,
                        inventoryItemId,

                        quantity: calculated.quantity,
                        remainingQuantity: receivedQuantity,

                        remainingCost,

                        defectiveQuantity: item.defectiveQuantity,
                        remainingDefectiveQuantity:
                            receivedDefectiveQuantity,
                        defectNote: item.defectNote || null,

                        unitPurchasePrice:
                            calculated.unitPurchasePrice,
                        allocatedExtraCostTotal:
                            calculated.allocatedExtraCostTotal,
                        finalUnitCost:
                            calculated.finalUnitCost,

                        plannedPricingMethod: item.pricingMethod,
                        plannedPricingValue: pricingData.pricingValue,

                        createdAt,
                    });

                    if (isReceived) {
                        stockLots.push({
                            id: purchaseItemId,
                            inventoryItemId,
                            purchaseItemId,

                            quantity: calculated.quantity,
                            remainingQuantity: receivedQuantity,

                            defectiveQuantity: item.defectiveQuantity,
                            remainingDefectiveQuantity:
                                receivedDefectiveQuantity,

                            unitCost: calculated.finalUnitCost,
                            remainingCost,

                            availableAt: purchase.purchaseDate,
                            createdAt,
                        });
                    }

                    if (receivedGoodQuantity > 0) {
                        movements.push({
                            inventoryItemId,
                            purchaseItemId,
                            type: "PURCHASE_IN",
                            condition: "GOOD",
                            quantity: receivedGoodQuantity,
                            createdAt,
                        });
                    }

                    if (receivedDefectiveQuantity > 0) {
                        movements.push({
                            inventoryItemId,
                            purchaseItemId,
                            type: "PURCHASE_IN",
                            condition: "DEFECTIVE",
                            quantity: receivedDefectiveQuantity,
                            note: item.defectNote || null,
                            createdAt,
                        });
                    }
                }

                if (createdInventory.size > 0) {
                    await tx.inventoryItem.createMany({
                        data: [...createdInventory.values()],
                    });
                }

                if (updatedInventory.size > 0) {
                    const updates = [...updatedInventory.entries()];
                    const ids = updates.map(([id]) => id);
                    const images = updates.map(([, update]) => update.imageUrl);

                    if (isReceived) {
                        await tx.$executeRaw`
                            UPDATE "InventoryItem" AS item
                            SET
                                "imageUrl" = changes."imageUrl",
                                "salePrice" = changes."salePrice"::numeric,
                                "pricingMethod" = changes."pricingMethod"::"PricingMethod",
                                "pricingValue" = changes."pricingValue"::numeric,
                                "isActive" = true,
                                "currentStock" = item."currentStock" + changes."increment",
                                "updatedAt" = NOW()
                            FROM unnest(
                                ${ids}::text[],
                                ${images}::text[],
                                ${updates.map(([, update]) => update.pricing?.salePrice ?? null)}::text[],
                                ${updates.map(([, update]) => update.pricing?.pricingMethod ?? null)}::text[],
                                ${updates.map(([, update]) => update.pricing?.pricingValue ?? null)}::text[],
                                ${updates.map(([, update]) => update.increment)}::int[]
                            ) AS changes(
                                "id",
                                "imageUrl",
                                "salePrice",
                                "pricingMethod",
                                "pricingValue",
                                "increment"
                            )
                            WHERE item."id" = changes."id"
                              AND item."businessId" = ${businessId}
                        `;
                    } else {
                        await tx.$executeRaw`
                            UPDATE "InventoryItem" AS item
                            SET
                                "imageUrl" = changes."imageUrl",
                                "updatedAt" = NOW()
                            FROM unnest(
                                ${ids}::text[],
                                ${images}::text[]
                            ) AS changes("id", "imageUrl")
                            WHERE item."id" = changes."id"
                              AND item."businessId" = ${businessId}
                        `;
                    }
                }

                await tx.purchaseItem.createMany({ data: purchaseItems });

                if (stockLots.length > 0) {
                    await tx.inventoryStockLot.createMany({ data: stockLots });
                }

                if (movements.length > 0) {
                    await tx.inventoryMovement.createMany({ data: movements });
                }

                return {
                    id: purchase.id,
                    number: purchase.number,
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            },
        ).catch(async (error: unknown) => {
            // კავშირის შეცდომა ყოველთვის არ ნიშნავს,
            // რომ ბაზაში შენახვა ვერ შესრულდა.
            // იმავე ბლოკირებით ველოდებით მის დასრულებას.
            let verification: {
                id: string;
                number: number;
                businessId: string;
            } | null;

            try {
                verification = await prisma.$transaction(
                    async (tx) => {
                        await tx.$queryRaw`
                            SELECT "id"
                            FROM "Business"
                            WHERE "id" = ${businessId}
                            FOR UPDATE
                        `;

                        return tx.purchase.findUnique({
                            where: { id: requestId },
                            select: {
                                id: true,
                                number: true,
                                businessId: true,
                            },
                        });
                    },
                    {
                        maxWait: 10000,
                        timeout: 60000,
                    },
                );
            } catch {
                // გაურკვეველი შედეგისას ფოტოებს არ ვშლით:
                // შესაძლოა უკვე შენახულ პარტიას ეკუთვნოდეს.
                console.error("Purchase outcome requires verification", {
                    businessId,
                    requestId,
                    paths: [...uploadedImages.values()].map(
                        (image) => image.path,
                    ),
                });

                throw error;
            }

            if (
                verification &&
                verification.businessId === businessId
            ) {
                return {
                    id: verification.id,
                    number: verification.number,
                };
            }

            await cleanupUploadedImages();
            throw error;
        });

        if (reusedExistingPurchase) {
            await cleanupUploadedImages();
        }

        return result;
    } finally {
        await prisma.$disconnect();
    }
}