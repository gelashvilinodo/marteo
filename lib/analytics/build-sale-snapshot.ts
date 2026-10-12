import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockOrder } from "@/lib/orders/order-stock";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { allocateCost } from "./allocate-cost";

function fail(message: string): never {
    throw new OrderValidationError(message, 409);
}

export function buildSaleSnapshot(
    order: StockOrder,
    receivedQuantities: ReadonlyMap<string, number>,
) {
    const lines = order.items.flatMap(item => {
        const received = receivedQuantities.get(item.id) ?? 0;

        const quantity = item.stockRestoredAt
            ? 0
            : item.quantity - received;

        if (
            !Number.isSafeInteger(quantity) ||
            quantity < 0 ||
            quantity > item.quantity
        ) {
            fail("გაყიდვის ფინანსური რაოდენობა არასწორია.");
        }

        if (quantity === 0) return [];

        let cost = new Prisma.Decimal(0);
        let costComplete = false;

        if (item.source === "INVENTORY") {
            let allocatedQuantity = 0;
            costComplete = true;

            for (const allocation of item.allocations) {
                const remainingQuantity =
                    allocation.quantity -
                    allocation.returnedQuantity -
                    allocation.transferredQuantity;

                if (remainingQuantity < 0) {
                    fail("გაყიდვის მარაგის განაწილება არასწორია.");
                }

                allocatedQuantity += remainingQuantity;

                if (remainingQuantity === 0) continue;

                if (
                    allocation.totalCost === null ||
                    allocation.transferredCost === null
                ) {
                    costComplete = false;
                    continue;
                }

                const remainingCost = allocation.totalCost
                    .minus(allocation.returnedCost)
                    .minus(allocation.transferredCost);

                if (remainingCost.lt(0)) {
                    fail("გაყიდვის თვითღირებულების ნაშთი არასწორია.");
                }

                cost = cost.plus(remainingCost);
            }

            if (allocatedQuantity !== quantity) {
                fail("გაყიდული რაოდენობა მარაგის განაწილებას არ ემთხვევა.");
            }
        } else if (item.totalCost !== null) {
            const costParts = allocateCost(
                item.totalCost,
                [
                    quantity,
                    item.quantity - quantity,
                ],
            );

            cost = costParts[0];
            costComplete = true;
        }

        const revenue = item.unitPrice.mul(quantity);

        if (
            revenue.lt(0) ||
            !revenue.mul(100).isInteger() ||
            !cost.mul(100).isInteger()
        ) {
            fail("გაყიდვის თანხები თეთრების სიზუსტეს არ შეესაბამება.");
        }

        return [{
            sourceOrderItemId:
                item.financialSourceItemId ?? item.id,
            name: item.name,
            quantity,
            revenue,
            cost,
            costComplete,
        }];
    });

    return {
        lines,
        productRevenue: lines.reduce(
            (sum, line) => sum.plus(line.revenue),
            new Prisma.Decimal(0),
        ),
        deliveryRevenue: order.courierFee,
        costOfGoods: lines.reduce(
            (sum, line) => sum.plus(line.cost),
            new Prisma.Decimal(0),
        ),
        costComplete: lines.every(line => line.costComplete),
    };
}