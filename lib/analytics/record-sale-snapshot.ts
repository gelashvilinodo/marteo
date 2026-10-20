import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockOrder } from "@/lib/orders/order-stock";
import { OrderValidationError } from "@/lib/orders/validate-order";
import type { buildSaleSnapshot } from "./build-sale-snapshot";

type Snapshot = ReturnType<typeof buildSaleSnapshot>;

type PreviousLine = {
    sourceOrderItemId: string;
    quantity: string;
    revenue: string;
    cost: string;
    costComplete: boolean;
    name: string;
};

export async function recordSaleSnapshot(
    tx: Prisma.TransactionClient,
    businessId: string,
    order: StockOrder,
    snapshot: Snapshot,
    eventKey: string,
    kind: "SALE" | "RETURN" | "EXCHANGE_ADJUSTMENT" = "SALE",
    occurredAt: Date = new Date(),
) {
    if (
        !(occurredAt instanceof Date) ||
        !Number.isFinite(occurredAt.getTime())
    ) {
        throw new OrderValidationError(
            "გაყიდვის აღრიცხვის თარიღი არასწორია.",
            422,
        );
    }
    const previousLines = await tx.$queryRaw<PreviousLine[]>`
        SELECT
            i."sourceOrderItemId",
            SUM(i."quantityDelta")::text AS quantity,
            SUM(i."revenueDelta")::text AS revenue,
            SUM(i."costDelta")::text AS cost,
            BOOL_AND(i."costComplete") AS "costComplete",
            MAX(i.name) AS name
        FROM "OrderFinancialEntryItem" i
        JOIN "OrderFinancialEntry" e ON e.id = i."entryId"
        WHERE e."businessId" = ${businessId}
            AND e."orderId" = ${order.id}
        GROUP BY i."sourceOrderItemId"
    `;

    const previousTotals = await tx.orderFinancialEntry.aggregate({
        where: {
            businessId,
            orderId: order.id,
        },
        _sum: {
            deliveryRevenueDelta: true,
        },
    });

    const previous = new Map(
        previousLines.map(line => [line.sourceOrderItemId, line]),
    );

    const current = new Map(
        snapshot.lines.map(line => [line.sourceOrderItemId, line]),
    );

    if (current.size !== snapshot.lines.length) {
        throw new OrderValidationError(
            "პროდუქტის ფინანსური იდენტობა განმეორებულია.",
            409,
        );
    }

    const sourceIds = new Set([
        ...previous.keys(),
        ...current.keys(),
    ]);

    const items = [];

    for (const sourceId of sourceIds) {
        const before = previous.get(sourceId);
        const candidate = current.get(sourceId);

        // დასრულებისას ყველა მიმდინარე გაყიდვა აღირიცხება.
        // სხვა მოქმედება მხოლოდ უკვე აღრიცხულ გაყიდვას ასწორებს.
        const after =
            kind === "SALE" || Number(before?.quantity ?? "0") > 0
                ? candidate
                : undefined;

        const previousQuantity = Number(before?.quantity ?? "0");

        if (!Number.isSafeInteger(previousQuantity)) {
            throw new OrderValidationError(
                "ფინანსური ისტორიის რაოდენობა არასწორია.",
                409,
            );
        }

        const quantityDelta =
            (after?.quantity ?? 0) - previousQuantity;

        const revenueDelta = (
            after?.revenue ?? new Prisma.Decimal(0)
        ).minus(before?.revenue ?? "0");

        const costDelta = (
            after?.cost ?? new Prisma.Decimal(0)
        ).minus(before?.cost ?? "0");

        const costComplete =
            (after?.costComplete ?? true) &&
            (before?.costComplete ?? true);

        if (
            quantityDelta === 0 &&
            revenueDelta.isZero() &&
            costDelta.isZero()
        ) {
            continue;
        }

        items.push({
            sourceOrderItemId: sourceId,
            name: after?.name ?? before!.name,
            quantityDelta,
            revenueDelta,
            costDelta,
            costComplete,
        });
    }

    const productRevenueDelta = items.reduce(
        (sum, item) => sum.plus(item.revenueDelta),
        new Prisma.Decimal(0),
    );

    const costOfGoodsDelta = items.reduce(
        (sum, item) => sum.plus(item.costDelta),
        new Prisma.Decimal(0),
    );

    const deliveryRevenueDelta = kind === "SALE"
        ? snapshot.deliveryRevenue.minus(
            previousTotals._sum.deliveryRevenueDelta ?? 0,
        )
        : new Prisma.Decimal(0);

    if (
        kind !== "SALE" &&
        items.length === 0 &&
        deliveryRevenueDelta.isZero()
    ) {
        return;
    }

    await tx.orderFinancialEntry.create({
        data: {
            businessId,
            orderId: order.id,
            orderNumber: order.number,
            fulfillmentCycle: order.fulfillmentCycle,
            eventKey,
            kind,
            productRevenueDelta,
            deliveryRevenueDelta,
            costOfGoodsDelta,
            costComplete:
                (kind !== "SALE" || snapshot.costComplete) &&
                items.every(item => item.costComplete),
            occurredAt: new Date(occurredAt.getTime()),
            ...(items.length > 0
                ? {
                    items: {
                        createMany: {
                            data: items,
                        },
                    },
                }
                : {}),
        },
    });
}