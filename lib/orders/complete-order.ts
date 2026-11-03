import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { recordSaleSnapshot } from "@/lib/analytics/record-sale-snapshot";
import type { StockOrder } from "./order-stock";
import { orderPayableTotal } from "./order-payable-total";
import { prepareCompletionCosts } from "./prepare-completion-costs";
import { OrderValidationError } from "./validate-order";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export type CompletionInput = {
    confirmFullPayment?: unknown;
    completionPaymentMethod?: unknown;
    completionBankName?: unknown;
    completionCosts?: unknown;
};

// შეკვეთის დასრულება: თვითღირებულება, დარჩენილი თანხის მიღება და გაყიდვის აღრიცხვა.
// თუ გამოტოვებული თვითღირებულებები არ იწერება, OrderValidationError ბაზაში
// ჩაწერამდე ჩნდება, ამიტომ ჯგუფურ დასრულებას შეუძლია ასეთი შეკვეთა გამოტოვოს.
export async function completeOrder(
    tx: Prisma.TransactionClient,
    businessId: string,
    order: StockOrder,
    input: CompletionInput,
) {
    if (order.paymentStatus === "UNKNOWN") {
        fail("ამ შეკვეთაზე გადახდა დაუზუსტებელია. დასრულებამდე მიუთითე რეალურად გადახდილი თანხა.");
    }

    const { receivedQuantities, remaining } = await completionBalance(tx, order);

    const snapshot = await prepareCompletionCosts(
        tx,
        order,
        receivedQuantities,
        input.completionCosts,
    );

    if (remaining.gt(0)) {
        if (input.confirmFullPayment !== true) {
            fail(`დარჩენილია ${remaining.toFixed(2)} ₾. დასრულებამდე დაადასტურე ამ თანხის რეალურად მიღება.`);
        }

        const method = input.completionPaymentMethod;

        if (
            method !== "CASH" &&
            method !== "BANK_TRANSFER" &&
            method !== "CARD"
        ) {
            fail("აირჩიე დარჩენილი თანხის გადახდის მეთოდი.");
        }

        if (
            input.completionBankName !== undefined &&
            typeof input.completionBankName !== "string"
        ) {
            fail("ბანკის დასახელება არასწორია.");
        }

        const bankName =
            method === "BANK_TRANSFER" &&
                typeof input.completionBankName === "string"
                ? input.completionBankName.trim()
                : "";

        await tx.orderPayment.create({
            data: {
                orderId: order.id,
                amount: remaining,
                method,
                bankName: bankName || null,
            },
        });
    }

    await tx.order.update({
        where: { id: order.id },
        data: {
            status: "COMPLETED",
            paymentStatus: "PAID",
            invoiceVersion: { increment: 1 },
        },
    });

    await recordSaleSnapshot(
        tx,
        businessId,
        order,
        snapshot,
        `sale:${order.id}:${order.fulfillmentCycle}`,
    );
}

// მიღებული დაბრუნებების გათვალისწინებით დარჩენილი გადასახდელი თანხა.
export async function completionBalance(
    tx: Prisma.TransactionClient,
    order: StockOrder,
) {
    const receivedQuantities = new Map<string, number>();
    const returnedItems = await tx.orderReturnItem.groupBy({
        by: ["orderItemId"],
        where: {
            orderReturn: {
                orderId: order.id,
                fulfillmentCycle: order.fulfillmentCycle,
                status: "RECEIVED",
            },
        },
        _sum: {
            quantity: true,
        },
    });

    for (const item of returnedItems) {
        receivedQuantities.set(
            item.orderItemId,
            Number(item._sum.quantity ?? 0),
        );
    }

    const total = orderPayableTotal(order, receivedQuantities);
    const paid = order.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
    );
    const remaining = total.minus(paid);

    return { receivedQuantities, remaining };
}
