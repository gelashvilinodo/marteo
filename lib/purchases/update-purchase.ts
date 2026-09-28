import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

import { validatePurchase } from "./validate-purchases";
import {
    lockPurchaseForEdit,
    PurchaseEditError,
} from "./lock-purchase-for-edit";
import {
    normalizeAttributeName,
    saveProductAttributes,
} from "./save-product-attributes";
import type { PurchaseImageChange } from "./save-purchase";
import {
    uploadProductImage,
    removeUncommittedProductImages,
} from "./product-images";

function normalizeText(value: string | null | undefined) {
    return (value ?? "").normalize("NFC").trim();
}

function checkedMoney(value: string | Prisma.Decimal) {
    const amount = new Prisma.Decimal(value).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
    );

    if (
        !amount.isFinite() ||
        amount.isNegative() ||
        amount.greaterThan("9999999999.99")
    ) {
        throw new PurchaseEditError(
            "თანხა დასაშვებ ზღვარს აღემატება.",
        );
    }

    return amount;
}

export async function updatePurchase(
    purchaseId: string,
    expectedUpdatedAt: string,
    value: unknown,
    imageChanges?: PurchaseImageChange[],
) {
    if (!purchaseId || purchaseId.length > 100) {
        throw new PurchaseEditError("პარტიის კოდი არასწორია.");
    }

    const user = await getCurrentUser();

    if (!user) {
        throw new PurchaseEditError(
            "რედაქტირებისთვის შედი ანგარიშში.",
            401,
        );
    }

    const input = validatePurchase(value);

    const changes: PurchaseImageChange[] =
        imageChanges ??
        input.items.map(() => ({ action: "keep" }));

    if (
        !Array.isArray(changes) ||
        changes.length !== input.items.length
    ) {
        throw new PurchaseEditError(
            "პროდუქტებისა და ფოტოების მონაცემები ერთმანეთს არ ემთხვევა.",
        );
    }

    for (const change of changes) {
        if (
            !change ||
            !["keep", "remove", "upload"].includes(change.action)
        ) {
            throw new PurchaseEditError(
                "ფოტოს მოქმედება არასწორია.",
            );
        }

        if (
            change.action === "upload" &&
            (
                !(change.file instanceof File) ||
                change.file.size === 0 ||
                change.file.size > 5 * 1024 * 1024
            )
        ) {
            throw new PurchaseEditError(
                "აირჩიე ფოტო, რომლის ზომა მაქსიმუმ 5 MB იქნება.",
            );
        }
    }

    const prisma = createPrismaClient();

    const uploadedImages = new Map<
        number,
        { path: string; url: string }
    >();

    let uploadBusinessId: string | null = null;

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            throw new PurchaseEditError(
                "ბიზნესზე წვდომა ვერ მოიძებნა.",
                403,
            );
        }

        const businessId = membership.businessId;

        uploadBusinessId = businessId;

        const hasUploads = changes.some(
            (change) => change.action === "upload",
        );

        if (hasUploads) {
            // ატვირთვამდე ვამოწმებთ წვდომას და პარტიის ვერსიას.
            await prisma.$transaction(
                async (tx) => {
                    await lockPurchaseForEdit(tx, {
                        userId: user.id,
                        businessId,
                        purchaseId,
                        expectedUpdatedAt,
                        purchaseItemIds: input.items.map(
                            (item) => item.purchaseItemId,
                        ),
                    });
                },
                {
                    maxWait: 10000,
                    timeout: 60000,
                },
            );

            // ფოტოები იტვირთება ბაზის ტრანზაქციის გარეთ.
            for (const [index, change] of changes.entries()) {
                if (change.action !== "upload") continue;

                const uploaded = await uploadProductImage(
                    businessId,
                    change.file,
                );

                uploadedImages.set(index, uploaded);
            }
        }

        return await prisma.$transaction(
            async (tx) => {
                const purchase = await lockPurchaseForEdit(tx, {
                    userId: user.id,
                    businessId,
                    purchaseId,
                    expectedUpdatedAt,
                    purchaseItemIds: input.items.map(
                        (item) => item.purchaseItemId,
                    ),
                });

                if (input.receiptStatus !== purchase.receiptStatus) {
                    throw new PurchaseEditError(
                        "რედაქტირებისას პარტიის მდგომარეობა ვერ შეიცვლება. გზაში მყოფი პარტიის მისაღებად გამოიყენე „პარტიის მიღება“.",
                        409,
                    );
                }

                const isReceived =
                    purchase.receiptStatus === "RECEIVED";

                if (isReceived) {
                    // ერთი მარაგის ჩანაწერი პარტიაში შეიძლება
                    // რამდენიმე სტრიქონში გვხვდებოდეს.
                    const previousQuantities = new Map<string, number>();

                    for (const item of purchase.items) {
                        previousQuantities.set(
                            item.inventoryItemId,
                            (previousQuantities.get(item.inventoryItemId) ?? 0)
                            + item.remainingQuantity,
                        );
                    }

                    for (const [inventoryItemId, quantity] of
                        [...previousQuantities.entries()].sort(
                            ([first], [second]) => first.localeCompare(second),
                        )) {
                        const result = await tx.inventoryItem.updateMany({
                            where: {
                                id: inventoryItemId,
                                businessId,
                                currentStock: { gte: quantity },
                            },
                            data: {
                                currentStock: {
                                    decrement: quantity,
                                },
                            },
                        });

                        if (result.count !== 1) {
                            throw new PurchaseEditError(
                                "მარაგის ნაშთი პარტიის რაოდენობას არ შეესაბამება. ცვლილებები არ შენახულა.",
                                409,
                            );
                        }
                    }

                    // დასაშვებია მხოლოდ გაუყიდავი პარტიის
                    // საწყისი მიღების ჩანაწერების ჩანაცვლება.
                    await tx.inventoryMovement.deleteMany({
                        where: {
                            type: "PURCHASE_IN",
                            purchaseItem: {
                                purchaseId: purchase.id,
                            },
                        },
                    });
                }

                const retainedIds: string[] = [];

                for (const [index, original] of input.items.entries()) {
                    const attributes = await saveProductAttributes(
                        tx,
                        businessId,
                        original,
                    );

                    const item = {
                        ...original,
                        ...attributes,
                    };

                    const calculated = input.calculation.items[index];

                    const source = item.sourceInventoryItemId
                        ? await tx.inventoryItem.findFirst({
                            where: {
                                id: item.sourceInventoryItemId,
                                businessId,
                            },
                            include: { product: true },
                        })
                        : null;

                    if (
                        item.sourceInventoryItemId &&
                        (
                            !source ||
                            source.product.businessId !== businessId
                        )
                    ) {
                        throw new PurchaseEditError(
                            `პროდუქტი ${index + 1}: მარაგის ჩანაწერი ვერ მოიძებნა.`,
                        );
                    }

                    const sameProduct =
                        source !== null &&
                        normalizeText(source.product.name) ===
                        normalizeText(item.name) &&
                        normalizeText(source.product.description) ===
                        normalizeText(item.description) &&
                        normalizeAttributeName(
                            source.product.brand ?? "",
                        ) === normalizeAttributeName(item.brand) &&
                        normalizeAttributeName(
                            source.product.category ?? "",
                        ) === normalizeAttributeName(item.category);

                    let productId: string;

                    if (source && sameProduct) {
                        productId = source.productId;
                    } else {
                        // საერთო პროდუქტის ინფორმაციას არ ვცვლით:
                        // სხვა პარტიებიც შეიძლება მას იყენებდნენ.
                        const product = await tx.product.create({
                            data: {
                                businessId,
                                name: item.name,
                                category: item.category,
                                brand: item.brand || null,
                                description: item.description || null,
                            },
                        });

                        productId = product.id;
                    }

                    const variants = await tx.inventoryItem.findMany({
                        where: {
                            businessId,
                            productId,
                        },
                        orderBy: [
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                    });

                    const matchingAttributes = (variant: {
                        color: string | null;
                        size: string | null;
                    }) =>
                        normalizeAttributeName(variant.color ?? "") ===
                        normalizeAttributeName(item.color) &&
                        normalizeAttributeName(variant.size ?? "") ===
                        normalizeAttributeName(item.size);

                    const exactSource =
                        source &&
                            sameProduct &&
                            matchingAttributes(source)
                            ? source
                            : null;

                    const existingInventory =
                        exactSource ??
                        variants.find(matchingAttributes);

                    const imageChange = changes[index];

                    let imageUrl =
                        existingInventory
                            ? existingInventory.imageUrl
                            : source?.imageUrl ?? null;

                    if (imageChange.action === "remove") {
                        imageUrl = null;
                    } else if (imageChange.action === "upload") {
                        const uploaded = uploadedImages.get(index);

                        if (!uploaded) {
                            throw new PurchaseEditError(
                                `პროდუქტი ${index + 1}: ატვირთული ფოტო ვერ მოიძებნა.`,
                            );
                        }

                        imageUrl = uploaded.url;
                    }

                    const inventory = existingInventory
                        ? imageChange.action === "keep"
                            ? existingInventory
                            : await tx.inventoryItem.update({
                                where: { id: existingInventory.id },
                                data: { imageUrl },
                            })
                        : await tx.inventoryItem.create({
                            data: {
                                businessId,
                                productId,
                                sku: `P-${crypto.randomUUID()}`,
                                color: item.color || null,
                                size: item.size || null,
                                imageUrl,
                                currentStock: 0,
                            },
                        });

                    const cost = checkedMoney(
                        calculated.finalUnitCost,
                    );
                    const pricingValue = checkedMoney(
                        item.pricingValue,
                    );

                    // მიღებისას გამოსათვლელი ფასიც ახლავე მოწმდება.
                    let plannedSalePrice = pricingValue;

                    if (item.pricingMethod === "FIXED_PROFIT") {
                        plannedSalePrice = cost.plus(pricingValue);
                    } else if (
                        item.pricingMethod === "MARKUP_PERCENT"
                    ) {
                        plannedSalePrice = cost.mul(
                            pricingValue.div(100).plus(1),
                        );
                    } else if (
                        item.pricingMethod === "MARGIN_PERCENT"
                    ) {
                        plannedSalePrice = cost.div(
                            new Prisma.Decimal(1).minus(
                                pricingValue.div(100),
                            ),
                        );
                    }

                    const salePrice = checkedMoney(plannedSalePrice);

                    if (isReceived) {
                        const result = await tx.inventoryItem.updateMany({
                            where: {
                                id: inventory.id,
                                businessId,
                                currentStock: {
                                    gte: 0,
                                    lte: 2147483647 - calculated.quantity,
                                },
                            },
                            data: {
                                currentStock: {
                                    increment: calculated.quantity,
                                },
                                isActive: true,
                            },
                        });

                        if (result.count !== 1) {
                            throw new PurchaseEditError(
                                "მარაგის ახალი რაოდენობა ვერ შეინახა. ცვლილებები გაუქმდა.",
                                409,
                            );
                        }

                        // თუ ამ პროდუქტს სხვა მიღებული პარტიაც იყენებს,
                        // მის საერთო გასაყიდ ფასს ჩუმად არ შევცვლით.
                        const otherReceivedItem =
                            await tx.purchaseItem.findFirst({
                                where: {
                                    inventoryItemId: inventory.id,
                                    purchase: {
                                        businessId,
                                        receiptStatus: "RECEIVED",
                                        id: { not: purchase.id },
                                    },
                                },
                                select: { id: true },
                            });

                        if (!otherReceivedItem) {
                            await tx.inventoryItem.update({
                                where: { id: inventory.id },
                                data: {
                                    pricingMethod: item.pricingMethod,
                                    pricingValue,
                                    salePrice,
                                },
                            });
                        }
                    }

                    const data = {
                        inventoryItemId: inventory.id,
                        quantity: calculated.quantity,
                        remainingQuantity: isReceived
                            ? calculated.quantity
                            : 0,
                        defectiveQuantity: isReceived
                            ? item.defectiveQuantity
                            : 0,
                        remainingDefectiveQuantity: isReceived
                            ? item.defectiveQuantity
                            : 0,
                        defectNote: isReceived
                            ? item.defectNote || null
                            : null,
                        unitPurchasePrice: checkedMoney(
                            calculated.unitPurchasePrice,
                        ),
                        allocatedExtraCostTotal: checkedMoney(
                            calculated.allocatedExtraCostTotal,
                        ),
                        finalUnitCost: cost,
                        plannedPricingMethod: item.pricingMethod,
                        plannedPricingValue: pricingValue,
                    };

                    const savedItem = item.purchaseItemId
                        ? await tx.purchaseItem.update({
                            where: { id: item.purchaseItemId },
                            data,
                            select: { id: true },
                        })
                        : await tx.purchaseItem.create({
                            data: {
                                purchaseId: purchase.id,
                                ...data,
                            },
                            select: { id: true },
                        });

                    if (isReceived) {
                        const goodQuantity =
                            calculated.quantity - item.defectiveQuantity;

                        if (goodQuantity > 0) {
                            await tx.inventoryMovement.create({
                                data: {
                                    inventoryItemId: inventory.id,
                                    purchaseItemId: savedItem.id,
                                    type: "PURCHASE_IN",
                                    condition: "GOOD",
                                    quantity: goodQuantity,
                                },
                            });
                        }

                        if (item.defectiveQuantity > 0) {
                            await tx.inventoryMovement.create({
                                data: {
                                    inventoryItemId: inventory.id,
                                    purchaseItemId: savedItem.id,
                                    type: "PURCHASE_IN",
                                    condition: "DEFECTIVE",
                                    quantity: item.defectiveQuantity,
                                    note: item.defectNote || null,
                                },
                            });
                        }
                    }

                    retainedIds.push(savedItem.id);
                }

                // ვშლით მხოლოდ ამ პარტიიდან ამოღებულ სტრიქონებს.
                // Product და InventoryItem ჩანაწერებს არ ვშლით.
                await tx.purchaseItem.deleteMany({
                    where: {
                        purchaseId: purchase.id,
                        id: { notIn: retainedIds },
                    },
                });

                // ვერსია აუცილებლად შეიცვლება, თუნდაც
                // ორი შენახვა ერთ მილიწამში შესრულდეს.
                const updatedAt = new Date(
                    Math.max(
                        Date.now(),
                        purchase.updatedAt.getTime() + 1,
                    ),
                );

                const updated = await tx.purchase.update({
                    where: { id: purchase.id },
                    data: {
                        name: input.name || null,
                        note: input.note || null,
                        purchaseDate: new Date(
                            `${input.purchaseDate}T00:00:00+04:00`,
                        ),
                        shippingCost: checkedMoney(
                            input.calculation.shippingCost,
                        ),
                        customsCost: checkedMoney(
                            input.calculation.customsCost,
                        ),
                        otherCost: checkedMoney(
                            input.calculation.otherCost,
                        ),
                        updatedAt,
                    },
                    select: {
                        id: true,
                        number: true,
                        updatedAt: true,
                    },
                });

                return {
                    id: updated.id,
                    number: updated.number,
                    updatedAt: updated.updatedAt.toISOString(),
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            },
        );
    } catch (error) {
        if (uploadBusinessId && uploadedImages.size > 0) {
            const businessId = uploadBusinessId;
            const uploads = [...uploadedImages.values()];

            try {
                const unusedPaths = await prisma.$transaction(
                    async (tx) => {
                        // ველოდებით შესაძლო მიმდინარე ტრანზაქციას.
                        await tx.$queryRaw`
                            SELECT "id"
                            FROM "Business"
                            WHERE "id" = ${businessId}
                            FOR UPDATE
                        `;

                        const references =
                            await tx.inventoryItem.findMany({
                                where: {
                                    businessId,
                                    imageUrl: {
                                        in: uploads.map(
                                            (image) => image.url,
                                        ),
                                    },
                                },
                                select: { imageUrl: true },
                            });

                        const usedUrls = new Set(
                            references.map(
                                (reference) => reference.imageUrl,
                            ),
                        );

                        return uploads
                            .filter(
                                (image) => !usedUrls.has(image.url),
                            )
                            .map((image) => image.path);
                    },
                    {
                        maxWait: 10000,
                        timeout: 60000,
                    },
                );

                await removeUncommittedProductImages(
                    businessId,
                    unusedPaths,
                );
            } catch {
                // თუ შედეგი ვერ გადავამოწმეთ, ფოტოს არ ვშლით:
                // შესაძლოა უკვე შენახულ ჩანაწერს ეკუთვნოდეს.
                console.error(
                    "Purchase edit images require cleanup verification",
                    {
                        purchaseId,
                        businessId,
                        paths: uploads.map((image) => image.path),
                    },
                );
            }
        }

        throw error;
    } finally {
        await prisma.$disconnect();
    }
}