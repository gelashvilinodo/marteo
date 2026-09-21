import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

import {
    PurchaseValidationError,
    validatePurchase,
} from "./validate-purchases";

import {
    uploadProductImage,
    removeUncommittedProductImages,
} from "./product-images";

import {
    saveProductAttributes,
    normalizeAttributeName,
} from "./save-product-attributes";

export type PurchaseImageChange =
    | { action: "keep" }
    | { action: "remove" }
    | { action: "upload"; file: File };

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
        fail("პარტიის დასამატებლად შედი ანგარიშში.");
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
            fail("აირჩიე ფოტო, რომლის ზომა მაქსიმუმ 5 MB იქნება.");
        }
    }

    const prisma = createPrismaClient();

    try {
        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
                select: { businessId: true },
            });

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
                    fail("ამ ბიზნესზე წვდომა აღარ გაქვს.");
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

                for (const [index, originalItem] of input.items.entries()) {
                    const attributes = await saveProductAttributes(
                        tx,
                        businessId,
                        originalItem,
                    );

                    const item = {
                        ...originalItem,
                        ...attributes,
                    };

                    const calculated = input.calculation.items[index];

                    const source = item.sourceInventoryItemId
                        ? await tx.inventoryItem.findFirst({
                            where: {
                                id: item.sourceInventoryItemId,
                                businessId,
                                isActive: true,
                            },
                            include: { product: true },
                        })
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

                    if (source && sameProduct) {
                        productId = source.productId;
                    } else {
                        const createdProduct = await tx.product.create({
                            data: {
                                businessId,
                                name: item.name,
                                brand: item.brand || null,
                                category: item.category,
                                description: item.description || null,
                            },
                        });

                        productId = createdProduct.id;
                    }

                    const variants = await tx.inventoryItem.findMany({
                        where: {
                            businessId,
                            productId,
                        },
                    });

                    const exactSource =
                        source &&
                            sameProduct &&
                            normalizeAttributeName(source.color ?? "") ===
                            normalizeAttributeName(item.color) &&
                            normalizeAttributeName(source.size ?? "") ===
                            normalizeAttributeName(item.size)
                            ? source
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
                            : source?.imageUrl ?? null;
                    }

                    const savedInventory = inventory
                        ? await tx.inventoryItem.update({
                            where: { id: inventory.id },
                            data: {
                                imageUrl,

                                // გზაში მყოფი პარტია არსებული
                                // მარაგის ფასსა და ნაშთს არ ცვლის.
                                ...(isReceived
                                    ? {
                                        ...pricingData,
                                        isActive: true,
                                        currentStock: {
                                            increment: receivedQuantity,
                                        },
                                    }
                                    : {}),
                            },
                        })
                        : await tx.inventoryItem.create({
                            data: {
                                businessId,
                                productId,
                                sku: `P-${crypto.randomUUID()}`,
                                color: item.color || null,
                                size: item.size || null,
                                imageUrl,

                                // ახალი პროდუქტის ჩანაწერი იქმნება,
                                // მაგრამ მიღებამდე ნაშთი ნულია.
                                currentStock: receivedQuantity,

                                ...(isReceived ? pricingData : {}),
                            },
                        });

                    const purchaseItem = await tx.purchaseItem.create({
                        data: {
                            purchaseId: purchase.id,
                            inventoryItemId: savedInventory.id,

                            quantity: calculated.quantity,
                            remainingQuantity: receivedQuantity,

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
                        },
                    });

                    if (receivedGoodQuantity > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                inventoryItemId: savedInventory.id,
                                purchaseItemId: purchaseItem.id,
                                type: "PURCHASE_IN",
                                condition: "GOOD",
                                quantity: receivedGoodQuantity,
                            },
                        });
                    }

                    if (receivedDefectiveQuantity > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                inventoryItemId: savedInventory.id,
                                purchaseItemId: purchaseItem.id,
                                type: "PURCHASE_IN",
                                condition: "DEFECTIVE",
                                quantity: receivedDefectiveQuantity,
                                note: item.defectNote || null,
                            },
                        });
                    };
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