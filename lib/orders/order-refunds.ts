import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { StockOrder } from "./order-stock";
import { paymentState } from "./order-rules";
import { OrderValidationError } from "./validate-order";

function fail(message: string): never {
    throw new OrderValidationError(message, 422);
}

// Authentication, tenant lock, version checking and retry journal are in mutateOrder.
export async function confirmOrderRefund(
    tx: Prisma.TransactionClient,
    order: StockOrder,
    body: Record<string, unknown>,
) {
    if (body.confirmRefund !== true) {
        fail("დაადასტურე, რომ თანხა კლიენტს რეალურად დაუბრუნე.");
    }
    if (typeof body.amount !== "string") fail("მიუთითე დაბრუნებული თანხა.");
    const text = body.amount.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
        fail("დაბრუნებული თანხა მიუთითე მაქსიმუმ ორი ათწილადით.");
    }
    const amount = new Prisma.Decimal(text);
    const total = order.items.reduce(
        (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
        order.courierFee,
    );
    const paid = order.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
    );
    const due = Prisma.Decimal.max(paid.minus(total), 0);
    if (amount.lte(0) || amount.gt(due)) {
        fail("თანხა უნდა იყოს დადებითი და არ აღემატებოდეს დასაბრუნებელ თანხას.");
    }
    const method = body.paymentMethod;
    if (method !== "CASH" && method !== "BANK_TRANSFER" && method !== "CARD") {
        fail("აირჩიე თანხის დაბრუნების მეთოდი.");
    }
    if (body.bankName !== undefined && typeof body.bankName !== "string") {
        fail("ბანკის დასახელების ფორმატი არასწორია.");
    }
    const bankName = method === "BANK_TRANSFER"
        ? (typeof body.bankName === "string" ? body.bankName.trim() : "")
        : "";
    await tx.orderPayment.create({
        data: {
            orderId: order.id,
            amount: amount.negated(),
            method,
            bankName: bankName || null,
        },
    });
    const paidAfter = paid.minus(amount);
    await tx.order.update({
        where: { id: order.id },
        data: {
            paymentStatus: paidAfter.gte(total)
                ? "PAID"
                : paymentState(total, paidAfter, order.courierFee),
            invoiceVersion: { increment: 1 },
        },
    });
    return {
        refundedAmount: amount.toFixed(2),
        paidAmount: paidAfter.toFixed(2),
        refundDue: Prisma.Decimal.max(paidAfter.minus(total), 0).toFixed(2),
    };
}
