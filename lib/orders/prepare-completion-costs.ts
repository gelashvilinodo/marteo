import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockOrder } from "./order-stock";
import { OrderValidationError } from "./validate-order";
import { buildSaleSnapshot } from "@/lib/analytics/build-sale-snapshot";

function fail(message: string): never {
    throw new OrderValidationError(message, 422);
}

export async function prepareCompletionCosts(
    tx: Prisma.TransactionClient,
    order: StockOrder,
    receivedQuantities: ReadonlyMap<string, number>,
    raw: unknown,
) {
    const missing = order.items.filter(item =>
        item.source === "MANUAL" &&
        item.totalCost === null &&
        !item.stockRestoredAt &&
        item.quantity >
            (receivedQuantities.get(item.id) ?? 0),
    );

    const submitted = raw === undefined ? [] : raw;

    if (!Array.isArray(submitted)) {
        fail("თვითღირებულებების ფორმატი არასწორია.");
    }

    const costs = new Map<string, Prisma.Decimal>();

    for (const value of submitted) {
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            fail("თვითღირებულების მონაცემი არასწორია.");
        }

        const data = value as Record<string, unknown>;

        if (
            typeof data.orderItemId !== "string" ||
            typeof data.unitCost !== "string"
        ) {
            fail("მიუთითე პროდუქტი და მისი თვითღირებულება.");
        }

        if (
            !missing.some(item => item.id === data.orderItemId) ||
            costs.has(data.orderItemId)
        ) {
            fail("თვითღირებულების პროდუქტი არასწორია ან მეორდება.");
        }

        const text = data.unitCost.trim().replace(",", ".");

        if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
            fail("თვითღირებულება მიუთითე თეთრების სიზუსტით.");
        }

        const amount = new Prisma.Decimal(text);

        if (amount.gt("9999999999.99")) {
            fail("თვითღირებულება ბაზის თანხის ველში ვერ მოთავსდება.");
        }

        costs.set(data.orderItemId, amount);
    }

    const notProvided = missing.filter(
        item => !costs.has(item.id),
    );

    if (notProvided.length > 0) {
        fail(
            `დასრულებამდე მიუთითე ერთი ერთეულის თვითღირებულება: ${
                notProvided.map(item => item.name).join(", ")
            }. თუ ხარჯი ნამდვილად არ გქონია, ჩაწერე 0.`,
        );
    }

    for (const item of missing) {
        const unitCost = costs.get(item.id)!;
        const totalCost = unitCost.mul(item.quantity);

        if (totalCost.gt("9999999999999999.99")) {
            fail(`${item.name}: სრული ხარჯი ბაზის ველში ვერ მოთავსდება.`);
        }

        const result = await tx.orderItem.updateMany({
            where: {
                id: item.id,
                orderId: order.id,
                isActive: true,
                totalCost: null,
            },
            data: {
                unitCost,
                totalCost,
            },
        });

        if (result.count !== 1) {
            fail("პროდუქტი უკვე შეიცვალა. განაახლე შეკვეთა.");
        }

        // ფინანსური გამოთვლა იმავე ახალ მონაცემებს იყენებს.
        item.unitCost = unitCost;
        item.totalCost = totalCost;
    }

    const snapshot = buildSaleSnapshot(
        order,
        receivedQuantities,
    );

    const incomplete = snapshot.lines.filter(
        line => !line.costComplete,
    );

    if (incomplete.length > 0) {
        fail(
            `შეკვეთა ვერ დასრულდება: ${
                incomplete.map(line => line.name).join(", ")
            } — მარაგის პარტიიდან ზუსტი თვითღირებულება ვერ მოიძებნა. პარტიის ხარჯის აღდგენაა საჭირო.`,
        );
    }

    return snapshot;
}