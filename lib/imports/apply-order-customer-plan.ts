import "server-only";

import type {
    Prisma,
} from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    normalizeCustomerPhone,
} from "@/lib/orders/validate-order";
import {
    validateImportCustomer,
} from "./validate-import-customer";
import type {
    OrderCustomerPlanItem,
} from "./build-order-customer-plan";

function fail(message: string): never {
    throw new OrderValidationError(message, 409);
}

// მხოლოდ ავტორიზებულ ტრანზაქციაში გამოიძახება.
// ბიზნესი დაბლოკილი უნდა იყოს და გეგმა იმავე
// ტრანზაქციაში ახალი შემოწმებიდან უნდა მოდიოდეს.
export async function applyOrderCustomerPlan(input: {
    tx: Prisma.TransactionClient;
    businessId: string;
    items: readonly OrderCustomerPlanItem[];
}) {
    const { tx, businessId, items } = input;

    const seenPhones = new Set<string>();
    const seenOrders = new Set<string>();

    for (const item of items) {
        if (
            !/^\+[1-9]\d{7,14}$/.test(item.phone) ||
            seenPhones.has(item.phone)
        ) {
            fail("მომხმარებლის გეგმის ნომერი არასწორია ან მეორდება.");
        }

        seenPhones.add(item.phone);

        if (item.action === "BLOCKED") {
            fail(item.reason ?? "მომხმარებელთან კავშირი დასაზუსტებელია.");
        }

        for (const orderKey of item.orderKeys) {
            if (seenOrders.has(orderKey)) {
                fail("ერთი შეკვეთა რამდენიმე მომხმარებელს უკავშირდება.");
            }

            seenOrders.add(orderKey);
        }
    }

    const linkIds = [...new Set(
        items.flatMap(item =>
            item.action === "LINK" && item.customerId
                ? [item.customerId]
                : [],
        ),
    )];

    const existing = linkIds.length === 0
        ? []
        : await tx.customer.findMany({
            where: {
                id: { in: linkIds },
                businessId,
                deletedAt: null,
            },
            select: {
                id: true,
                phone: true,
                updatedAt: true,
            },
        });

    const byId = new Map(
        existing.map(customer => [customer.id, customer]),
    );

    const customerByOrderKey = new Map<string, string | null>();

    let createdCount = 0;
    let linkedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
        let customerId: string | null = null;

        if (item.action === "LINK") {
            const customer = item.customerId
                ? byId.get(item.customerId)
                : null;

            if (
                !customer ||
                normalizeCustomerPhone(customer.phone) !== item.phone ||
                customer.updatedAt.toISOString() !== item.customerUpdatedAt
            ) {
                fail(
                    `${item.phone}: არჩეული მომხმარებელი შეიცვალა. ხელახლა შეამოწმე დამთხვევა.`,
                );
            }

            customerId = customer.id;
            linkedCount++;
        } else if (item.action === "CREATE") {
            const validated = validateImportCustomer(item.data);

            if (
                !validated.valid ||
                validated.data.phone !== item.phone
            ) {
                fail(
                    `${item.phone}: ახალი მომხმარებლის მონაცემები ვერ დადასტურდა.`,
                );
            }

            const customer = await tx.customer.create({
                data: {
                    businessId,
                    phone: validated.data.phone,
                    address: validated.data.address,
                    firstName: validated.data.firstName,
                    lastName: validated.data.lastName,
                },
                select: { id: true },
            });

            customerId = customer.id;
            createdCount++;
        } else if (item.action === "SKIP") {
            skippedCount++;
        } else {
            fail("მომხმარებლის გეგმის მოქმედება არასწორია.");
        }

        for (const orderKey of item.orderKeys) {
            customerByOrderKey.set(orderKey, customerId);
        }
    }

    return {
        customerByOrderKey,
        createdCount,
        linkedCount,
        skippedCount,
    };
}