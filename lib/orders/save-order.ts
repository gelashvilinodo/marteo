import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

import {
    OrderValidationError,
    validateOrder,
} from "./validate-order";

import { paymentState } from "./order-rules";
import { resolveOrderCustomer, createOrderItems } from "./order-stock";

import { createPublicOrderToken } from "./create-public-order-token";

function fail(message: string, status = 400): never {
    throw new OrderValidationError(message, status);
}

export async function saveOrder(raw: unknown) {
    const user = await getCurrentUser();

    if (!user) {
        fail("შეკვეთის შესანახად გაიარე ავტორიზაცია.", 401);
    }

    const data = validateOrder(raw);
    const prisma = createPrismaClient();

    try {
        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
                select: { businessId: true },
            });

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.", 403);
        }

        const businessId = membership.businessId;

        return await prisma.$transaction(
            async (tx) => {
                // შესყიდვებიც იმავე ბიზნესის ბლოკირებას იყენებს.
                // ერთდროული ცვლილებები თანმიმდევრულად შესრულდება.
                const lockedBusiness = await tx.$queryRaw<
                    Array<{ id: string }>
                >`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${businessId}
                    FOR UPDATE
                `;

                if (!lockedBusiness.length) {
                    fail("ბიზნესი ვერ მოიძებნა.", 404);
                }

                const existing = await tx.order.findUnique({
                    where: {
                        businessId_clientRequestId: {
                            businessId,
                            clientRequestId: data.clientRequestId,
                        },
                    },
                    select: {
                        id: true,
                        number: true,
                        deletedAt: true,
                    },
                });

                if (existing) {
                    if (existing.deletedAt) {
                        fail(
                            "ეს შეკვეთა უკვე შეიქმნა და შემდეგ წაიშალა.",
                            409,
                        );
                    }

                    return {
                        id: existing.id,
                        number: existing.number,
                        alreadySaved: true,
                    };
                }

                const inventoryIds = [
                    ...new Set(
                        data.items.flatMap((item) =>
                            item.inventoryItemId
                                ? [item.inventoryItemId]
                                : [],
                        ),
                    ),
                ].sort();

                if (inventoryIds.length > 0) {
                    const lockedInventory = await tx.$queryRaw<
                        Array<{ id: string }>
                    >(
                        Prisma.sql`
                            SELECT "id"
                            FROM "InventoryItem"
                            WHERE "businessId" = ${businessId}
                              AND "id" IN (
                                  ${Prisma.join(inventoryIds)}
                              )
                            ORDER BY "id"
                            FOR UPDATE
                        `,
                    );

                    if (
                        lockedInventory.length !==
                        inventoryIds.length
                    ) {
                        fail(
                            "ერთ-ერთი პროდუქტი მარაგში ვერ მოიძებნა.",
                            409,
                        );
                    }
                }

                const customer = await resolveOrderCustomer(tx, businessId, data);

                const business = await tx.business.update({
                    where: { id: businessId },
                    data: {
                        nextOrderNumber: { increment: 1 },
                    },
                    select: {
                        nextOrderNumber: true,
                    },
                });

                const total = data.items.reduce(
                    (sum, item) =>
                        sum.plus(
                            item.unitPrice.mul(item.quantity),
                        ),
                    data.courierFee,
                );

                const paymentStatus = paymentState(total, data.paidAmount, data.courierFee);

                const order = await tx.order.create({
                    data: {
                        businessId,
                        customerId: customer.id,
                        number: business.nextOrderNumber,
                        clientRequestId: data.clientRequestId,
                        publicAccessToken: createPublicOrderToken(),
                        recipientPhone: data.recipientPhone,
                        recipientFirstName:
                            data.recipientFirstName || null,
                        recipientLastName:
                            data.recipientLastName || null,
                        shippingAddress:
                            data.shippingAddress || null,
                        status: data.status,
                        paymentStatus,
                        courierFee: data.courierFee,
                    },
                    select: {
                        id: true,
                        number: true,
                    },
                });

                await createOrderItems(tx, businessId, order.id, data.items);

                if (data.paidAmount.greaterThan(0)) {
                    await tx.orderPayment.create({
                        data: {
                            orderId: order.id,
                            amount: data.paidAmount,
                            method: data.paymentMethod,
                            bankName: data.bankName || null,
                        },
                    });
                }

                return {
                    ...order,
                    alreadySaved: false,
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