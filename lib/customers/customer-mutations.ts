import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "@/lib/orders/validate-order";
import {
    customerObject,
    validateCustomer,
} from "./validate-customer";
import { findCustomerByPhone } from "./find-customer-by-phone";

type Action = "create" | "edit" | "delete";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export async function mutateCustomers(
    action: Action,
    raw: unknown,
) {
    const user = await getCurrentUser();

    if (!user) fail("გაიარე ავტორიზაცია.", 401);

    const body = customerObject(raw);
    const prisma = createPrismaClient();

    try {
        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: [
                    { createdAt: "asc" },
                    { businessId: "asc" },
                ],
                select: { businessId: true },
            });

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.", 403);
        }

        const businessId = membership.businessId;

        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`
                SELECT "id"
                FROM "Business"
                WHERE "id" = ${businessId}
                FOR UPDATE
            `;

            if (action === "delete") {
                if (body.confirmDeletion !== true) {
                    fail("დაადასტურე მომხმარებლების წაშლა.");
                }

                if (
                    !Array.isArray(body.ids) ||
                    !body.ids.length
                ) {
                    fail("მონიშნე წასაშლელი მომხმარებლები.");
                }

                const ids = [
                    ...new Set(
                        body.ids.map(value => {
                            if (
                                typeof value !== "string" ||
                                !value.trim()
                            ) {
                                fail("მომხმარებლის კოდი არასწორია.");
                            }

                            return value.trim();
                        }),
                    ),
                ];

                const count = await tx.customer.count({
                    where: {
                        businessId,
                        id: { in: ids },
                    },
                });

                if (count !== ids.length) {
                    fail(
                        "ერთ-ერთი მომხმარებელი ვერ მოიძებნა ამ ბიზნესში.",
                        404,
                    );
                }

                await tx.customer.updateMany({
                    where: {
                        businessId,
                        id: { in: ids },
                        deletedAt: null,
                    },
                    data: {
                        deletedAt: new Date(),
                    },
                });

                return {
                    action,
                    deletedIds: ids,
                };
            }

            const data = validateCustomer(body);

            const matches = await findCustomerByPhone(
                tx,
                businessId,
                data.phone,
            );

            if (action === "create") {
                if (
                    matches.some(
                        customer => !customer.deletedAt,
                    )
                ) {
                    fail(
                        "ამ ტელეფონის ნომრით მომხმარებელი უკვე არსებობს.",
                        409,
                    );
                }

                const previous = matches[0];

                const customer = previous
                    ? await tx.customer.update({
                        where: {
                            id: previous.id,
                        },
                        data: {
                            ...data,
                            deletedAt: null,
                        },
                    })
                    : await tx.customer.create({
                        data: {
                            businessId,
                            ...data,
                        },
                    });

                return {
                    action,
                    customer,
                    restored: Boolean(previous),
                };
            }

            if (
                typeof body.id !== "string" ||
                !body.id.trim()
            ) {
                fail("მომხმარებლის კოდი არასწორია.");
            }

            const id = body.id.trim();

            const existing = await tx.customer.findFirst({
                where: {
                    id,
                    businessId,
                    deletedAt: null,
                },
                select: {
                    id: true,
                },
            });

            if (!existing) {
                fail("მომხმარებელი ვერ მოიძებნა.", 404);
            }

            if (
                matches.some(
                    customer => customer.id !== id,
                )
            ) {
                fail(
                    "ეს ტელეფონის ნომერი სხვა მომხმარებლის ჩანაწერს ეკუთვნის.",
                    409,
                );
            }

            const customer = await tx.customer.update({
                where: { id },
                data,
            });

            return {
                action,
                customer,
                restored: false,
            };
        }, {
            maxWait: 10000,
            timeout: 60000,
        });
    } finally {
        await prisma.$disconnect();
    }
}