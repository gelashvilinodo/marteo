import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

export class ReceivePurchaseError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "ReceivePurchaseError";
    }
}

type ReceiptItem = {
    id: string;
    defectiveQuantity: number;
    defectNote: string;
};

function fail(message: string, status = 400): never {
    throw new ReceivePurchaseError(message, status);
}

function readItems(value: unknown): ReceiptItem[] {
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > 200
    ) {
        fail("მიღების მონაცემებში უნდა იყოს 1-დან 200-მდე პროდუქტი.");
    }

    const ids = new Set<string>();

    return value.map((entry, index) => {
        if (
            typeof entry !== "object" ||
            entry === null ||
            Array.isArray(entry)
        ) {
            fail(`პროდუქტი ${index + 1}: მონაცემები არასწორია.`);
        }

        const row = entry as Record<string, unknown>;

        if (
            typeof row.id !== "string" ||
            !row.id ||
            row.id.length > 100 ||
            ids.has(row.id)
        ) {
            fail("პროდუქტის ჩანაწერი არასწორია ან მეორდება.");
        }

        ids.add(row.id);

        if (
            typeof row.defectiveQuantity !== "number" ||
            !Number.isSafeInteger(row.defectiveQuantity) ||
            row.defectiveQuantity < 0 ||
            row.defectiveQuantity > 1000000
        ) {
            fail(
                `პროდუქტი ${index + 1}: წუნდებული რაოდენობა არასწორია.`,
            );
        }

        if (
            row.defectNote !== undefined &&
            typeof row.defectNote !== "string"
        ) {
            fail("წუნის აღწერის ფორმატი არასწორია.");
        }

        const defectNote =
            typeof row.defectNote === "string"
                ? row.defectNote.normalize("NFC").trim()
                : "";

        if (defectNote.length > 2000) {
            fail("წუნის აღწერა მაქსიმუმ 2000 სიმბოლო უნდა იყოს.");
        }

        if (row.defectiveQuantity === 0 && defectNote) {
            fail("წუნის აღწერისთვის მიუთითე წუნდებული რაოდენობაც.");
        }

        return {
            id: row.id,
            defectiveQuantity: row.defectiveQuantity,
            defectNote,
        };
    });
}

function checkedMoney(value: Prisma.Decimal): Prisma.Decimal {
    if (!value.isFinite() || value.isNegative()) {
        fail("გასაყიდი ფასის გამოთვლა ვერ მოხერხდა.");
    }

    const rounded = value.toDecimalPlaces(2);

    if (rounded.greaterThan("9999999999.99")) {
        fail("გასაყიდი ფასი დასაშვებ ზღვარს აღემატება.");
    }

    return rounded;
}

export async function receivePurchase(
    purchaseId: string,
    rawItems: unknown,
) {
    if (!purchaseId || purchaseId.length > 100) {
        fail("პარტიის კოდი არასწორია.");
    }

    const items = readItems(rawItems);

    const user = await getCurrentUser();

    if (!user) {
        fail("გთხოვ, ხელახლა გაიარე ავტორიზაცია.", 401);
    }

    const prisma = createPrismaClient();

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            fail("ბიზნესზე წვდომა ვერ მოიძებნა.", 403);
        }

        const businessId = membership.businessId;

        return await prisma.$transaction(
            async (tx) => {
                // იგივე ბლოკირება გამოიყენება პარტიის შექმნისასაც.
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
                    fail("ამ ბიზნესზე წვდომა აღარ გაქვს.", 403);
                }

                const purchase = await tx.purchase.findFirst({
                    where: {
                        id: purchaseId,
                        businessId,
                    },
                    include: {
                        items: {
                            orderBy: [
                                { createdAt: "asc" },
                                { id: "asc" },
                            ],
                        },
                    },
                });

                if (!purchase) {
                    fail("პარტია ვერ მოიძებნა.", 404);
                }

                const submittedById = new Map(
                    items.map((item) => [item.id, item]),
                );

                if (
                    purchase.items.length !== items.length ||
                    purchase.items.some(
                        (item) => !submittedById.has(item.id),
                    )
                ) {
                    fail(
                        "პარტიის პროდუქტები შეიცვალა. განაახლე გვერდი და სცადე ხელახლა.",
                        409,
                    );
                }

                for (const item of purchase.items) {
                    const submitted = submittedById.get(item.id)!;

                    if (submitted.defectiveQuantity > item.quantity) {
                        fail(
                            "წუნდებული რაოდენობა შეძენილ რაოდენობას ვერ აღემატება.",
                        );
                    }
                }

                if (purchase.receiptStatus === "RECEIVED") {
                    const sameReceipt = purchase.items.every((item) => {
                        const submitted = submittedById.get(item.id)!;

                        return (
                            item.defectiveQuantity ===
                                submitted.defectiveQuantity &&
                            (item.defectNote ?? "") ===
                                submitted.defectNote
                        );
                    });

                    if (!sameReceipt) {
                        fail(
                            "პარტია უკვე მიღებულია სხვა მონაცემებით. განაახლე გვერდი.",
                            409,
                        );
                    }

                    return {
                        id: purchase.id,
                        number: purchase.number,
                        alreadyReceived: true,
                    };
                }

                // გზაში მყოფ პარტიას მიღებული ნაშთი,
                // გაყიდვა ან მარაგის მოძრაობა ჯერ არ უნდა ჰქონდეს.
                if (
                    purchase.items.some(
                        (item) =>
                            item.remainingQuantity !== 0 ||
                            item.remainingDefectiveQuantity !== 0,
                    )
                ) {
                    fail(
                        "პარტიის ნაშთი მიღების სტატუსს არ შეესაბამება.",
                        409,
                    );
                }

                const movement = await tx.inventoryMovement.findFirst({
                    where: {
                        purchaseItem: { purchaseId: purchase.id },
                    },
                    select: { id: true },
                });

                const allocation =
                    await tx.orderItemAllocation.findFirst({
                        where: {
                            purchaseItem: { purchaseId: purchase.id },
                        },
                        select: { id: true },
                    });

                if (movement || allocation) {
                    fail(
                        "პარტიაზე უკვე არსებობს მარაგის მოძრაობა.",
                        409,
                    );
                }

                for (const item of purchase.items) {
                    const submitted = submittedById.get(item.id)!;

                    const method = item.plannedPricingMethod;
                    const value = item.plannedPricingValue;

                    if (!method || value === null) {
                        fail(
                            "პარტიის პროდუქტზე გასაყიდი ფასის წესი არ არის შენახული.",
                            409,
                        );
                    }

                    const cost = item.finalUnitCost;
                    let salePrice = value;

                    if (method === "FIXED_PROFIT") {
                        salePrice = cost.plus(value);
                    } else if (method === "MARKUP_PERCENT") {
                        salePrice = cost.mul(value.div(100).plus(1));
                    } else if (method === "MARGIN_PERCENT") {
                        if (value.greaterThanOrEqualTo(100)) {
                            fail("მარჟა 100%-ზე ნაკლები უნდა იყოს.");
                        }

                        salePrice = cost.div(
                            new Prisma.Decimal(1).minus(value.div(100)),
                        );
                    }

                    const updatedInventory =
                        await tx.inventoryItem.updateMany({
                            where: {
                                id: item.inventoryItemId,
                                businessId,
                                currentStock: {
                                    gte: 0,
                                    lte: 2147483647 - item.quantity,
                                },
                            },
                            data: {
                                currentStock: {
                                    increment: item.quantity,
                                },
                                isActive: true,
                                pricingMethod: method,
                                pricingValue: checkedMoney(value),
                                salePrice: checkedMoney(salePrice),
                            },
                        });

                    if (updatedInventory.count !== 1) {
                        fail(
                            "მარაგის ჩანაწერი ვერ განახლდა. გადაამოწმე ნაშთი.",
                            409,
                        );
                    }

                    await tx.purchaseItem.update({
                        where: { id: item.id },
                        data: {
                            remainingQuantity: item.quantity,
                            defectiveQuantity:
                                submitted.defectiveQuantity,
                            remainingDefectiveQuantity:
                                submitted.defectiveQuantity,
                            defectNote: submitted.defectNote || null,
                        },
                    });

                    const goodQuantity =
                        item.quantity - submitted.defectiveQuantity;

                    if (goodQuantity > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                inventoryItemId: item.inventoryItemId,
                                purchaseItemId: item.id,
                                type: "PURCHASE_IN",
                                condition: "GOOD",
                                quantity: goodQuantity,
                            },
                        });
                    }

                    if (submitted.defectiveQuantity > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                inventoryItemId: item.inventoryItemId,
                                purchaseItemId: item.id,
                                type: "PURCHASE_IN",
                                condition: "DEFECTIVE",
                                quantity: submitted.defectiveQuantity,
                                note: submitted.defectNote || null,
                            },
                        });
                    }
                }

                await tx.purchase.update({
                    where: { id: purchase.id },
                    data: {
                        receiptStatus: "RECEIVED",
                        receivedAt: new Date(),
                    },
                });

                return {
                    id: purchase.id,
                    number: purchase.number,
                    alreadyReceived: false,
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            },
        );
    } finally {
        await prisma.$disconnect();
    }
}