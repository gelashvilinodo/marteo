import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    createPublicOrderToken,
} from "@/lib/orders/create-public-order-token";
import {
    fingerprint,
    paymentState,
} from "@/lib/orders/order-rules";
import {
    orderWithStock,
} from "@/lib/orders/order-stock";
import {
    buildSaleSnapshot,
} from "@/lib/analytics/build-sale-snapshot";
import {
    recordSaleSnapshot,
} from "@/lib/analytics/record-sale-snapshot";
import {
    validateImportDate,
} from "./validate-import-date";
import type {
    PreparedDraftOrder,
} from "./prepare-draft-orders";
import {
    normalizeCustomerPhone,
} from "@/lib/orders/validate-order";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function businessDate(value: unknown, label: string): Date {
    const result = validateImportDate(value, {
        field: "date",
        label,
    });

    if (!result.valid) {
        fail(result.issues.map(issue => issue.message).join(" "));
    }

    return new Date(`${result.data}T00:00:00+04:00`);
}

// მხოლოდ ავტორიზებულ ტრანზაქციაში გამოიძახება,
// ბიზნესისა და მონახაზის დაბლოკვის შემდეგ.
// order სერვერზე თავიდან გამოთვლილი გეგმის ნაწილი უნდა იყოს.
export async function createImportedManualOrder(input: {
    tx: Prisma.TransactionClient;
    businessId: string;
    jobId: string;
    order: PreparedDraftOrder;
    customerId?: string | null;
}) {
    const { tx, businessId, jobId, order } = input;

    if (order.result.kind !== "PREVIEW_READY") {
        fail("შეკვეთის მონაცემები ჯერ დასაზუსტებელია.");
    }

    if (
        order.group.requiresConfirmation &&
        !order.groupingConfirmed
    ) {
        fail("ჯერ დაადასტურე შეკვეთის ხაზების დაჯგუფება.");
    }

    const data = order.result.data;

    if (data.lines.length === 0) {
        fail("შეკვეთაში შესანახი პროდუქტები არ არის.");
    }

    const createdAt = businessDate(
        data.date,
        "შეკვეთის თარიღი",
    );

    const payment = data.payment;
    const paidAmount = payment.kind === "READY"
        ? new Prisma.Decimal(payment.paidAmount)
        : null;

    const total = new Prisma.Decimal(data.totals.payableTotal);

    if (paidAmount !== null && paidAmount.greaterThan(total)) {
        fail("გადახდილი თანხა შეკვეთის სრულ თანხას აღემატება.");
    }

    const paymentStatus = paidAmount === null
        ? "UNKNOWN"
        : paymentState(
            total,
            paidAmount,
            new Prisma.Decimal(data.totals.courierFee),
        );

    if (
        data.status === "COMPLETED" &&
        paymentStatus !== "PAID"
    ) {
        fail("დასრულებულ შეკვეთაზე სრული გადახდა უნდა დასტურდებოდეს.");
    }

    const receivedAt =
        paidAmount !== null && paidAmount.greaterThan(0)
            ? businessDate(
                data.paymentDate,
                "თანხის მიღების თარიღი",
            )
            : null;

    const customerId = input.customerId ?? null;

    if (customerId !== null) {
        const customer = await tx.customer.findFirst({
            where: {
                id: customerId,
                businessId,
                deletedAt: null,
            },
            select: { id: true, phone: true },
        });

        if (
            !customer ||
            normalizeCustomerPhone(customer.phone) !== data.contact.phone
        ) {
            fail(
                "არჩეული მომხმარებელი შეკვეთის ნომერს ან აქტიურ ბიზნესს არ შეესაბამება.",
                409,
            );
        }
    }

    const clientRequestId = await fingerprint({
        kind: "IMPORTED_MANUAL_ORDER",
        jobId,
        groupKey: order.group.key,
    });

    const existing = await tx.order.findUnique({
        where: {
            businessId_clientRequestId: {
                businessId,
                clientRequestId,
            },
        },
        select: { id: true },
    });

    if (existing) {
        fail(
            "ამ მონახაზის შეკვეთა უკვე არსებობს. განმეორებით შექმნას არ შევასრულებთ.",
            409,
        );
    }

    const business = await tx.business.update({
        where: { id: businessId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
    });

    const lines = data.lines.map(line => ({
        source: line,
        id: crypto.randomUUID(),
    }));

    const analyticsPendingCost = !data.costComplete;

    const saved = await tx.order.create({
        data: {
            businessId,
            customerId,
            number: business.nextOrderNumber,
            clientRequestId,
            publicAccessToken: createPublicOrderToken(),
            recipientPhone: data.contact.phone ?? "",
            recipientFirstName: data.contact.firstName,
            recipientLastName: data.contact.lastName,
            shippingAddress: data.contact.address,
            notes: data.notes,
            status: data.status,
            paymentStatus,
            analyticsPendingCost,
            courierFee: new Prisma.Decimal(data.totals.courierFee),
            createdAt,
            items: {
                create: lines.map(({ source, id }) => ({
                    id,
                    source: "MANUAL",
                    condition: "GOOD",
                    name: source.data.name,
                    color: source.data.color,
                    size: source.data.size,
                    quantity: source.data.quantity,
                    unitPrice: new Prisma.Decimal(source.data.unitPrice),
                    unitCost: new Prisma.Decimal(
                        source.data.unitCost ?? "0.00",
                    ),
                    totalCost: source.data.unitCost === null
                        ? null
                        : new Prisma.Decimal(source.data.unitCost)
                            .mul(source.data.quantity),
                    createdAt,
                })),
            },
        },
        select: { id: true, number: true },
    });

    if (
        paidAmount !== null &&
        paidAmount.greaterThan(0) &&
        receivedAt !== null
    ) {
        await tx.orderPayment.create({
            data: {
                orderId: saved.id,
                amount: paidAmount,
                method: "UNKNOWN",
                createdAt: receivedAt,
            },
        });
    }

    if (
        data.status === "COMPLETED" &&
        !analyticsPendingCost
    ) {
        const financialOrder = await tx.order.findUniqueOrThrow({
            where: { id: saved.id },
            include: orderWithStock,
        });

        await recordSaleSnapshot(
            tx,
            businessId,
            financialOrder,
            buildSaleSnapshot(financialOrder, new Map()),
            `import:${jobId}:${saved.id}:sale`,
            "SALE",
            createdAt,
        );
    }

    return {
        ...saved,
        analyticsPendingCost,
        items: lines.map(({ source, id }) => ({
            orderItemId: id,
            sourceRowKey: source.rowKey,
            sourceProductCode: source.data.productCode,
        })),
    };
}