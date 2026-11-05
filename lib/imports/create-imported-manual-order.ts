import { numericQuantities } from "@/lib/orders/quantity";
import "server-only";

import { Prisma, type PaymentStatus } from "@/generated/prisma/client";
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
    recordNewOrderSaleSnapshots,
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

// ბაზასთან შეხების გარეშე ამოწმებს ერთ შეკვეთას.
// order სერვერზე თავიდან გამოთვლილი გეგმის ნაწილი უნდა იყოს.
async function checkImportedOrder(
    jobId: string,
    order: PreparedDraftOrder,
    customerId: string | null,
) {
    if (order.result.kind !== "PREVIEW_READY") {
        fail("შეკვეთის მონაცემები ჯერ დასაზუსტებელია.");
    }

    if (
        order.group.requiresConfirmation &&
        !order.groupingConfirmed
    ) {
        fail("ჯერ დაადასტურეთ შეკვეთის ხაზების დაჯგუფება.");
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

    const paymentStatus: PaymentStatus = paidAmount === null
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

    const clientRequestId = await fingerprint({
        kind: "IMPORTED_MANUAL_ORDER",
        jobId,
        groupKey: order.group.key,
    });

    return {
        id: crypto.randomUUID(),
        data,
        customerId,
        createdAt,
        paidAmount,
        paymentStatus,
        receivedAt,
        clientRequestId,
        analyticsPendingCost: !data.costComplete,
        lines: data.lines.map(line => ({
            source: line,
            id: crypto.randomUUID(),
        })),
    };
}

// მხოლოდ ავტორიზებულ ტრანზაქციაში გამოიძახება,
// ბიზნესისა და მონახაზის დაბლოკვის შემდეგ.
// ყველა შეკვეთას ჯგუფურად წერს: თითო შეკვეთაზე ცალკე
// მოთხოვნები დიდ ფაილზე ტრანზაქციის ტაიმაუტს იწვევდა.
export async function createImportedManualOrders(input: {
    tx: Prisma.TransactionClient;
    businessId: string;
    jobId: string;
    orders: readonly {
        order: PreparedDraftOrder;
        customerId: string | null;
    }[];
}) {
    const { tx, businessId, jobId } = input;

    if (input.orders.length === 0) return [];

    const checked = await Promise.all(
        input.orders.map(({ order, customerId }) =>
            checkImportedOrder(jobId, order, customerId),
        ),
    );

    const customerIds = [...new Set(checked.flatMap(order =>
        order.customerId === null ? [] : [order.customerId],
    ))];

    const customers = customerIds.length === 0
        ? []
        : await tx.customer.findMany({
            where: {
                id: { in: customerIds },
                businessId,
                deletedAt: null,
            },
            select: { id: true, phone: true },
        });

    const customerPhones = new Map(
        customers.map(customer => [
            customer.id,
            normalizeCustomerPhone(customer.phone),
        ]),
    );

    for (const order of checked) {
        if (
            order.customerId !== null &&
            customerPhones.get(order.customerId) !==
            order.data.contact.phone
        ) {
            fail(
                "არჩეული მომხმარებელი შეკვეთის ნომერს ან აქტიურ ბიზნესს არ შეესაბამება.",
                409,
            );
        }
    }

    const existing = await tx.order.findFirst({
        where: {
            businessId,
            clientRequestId: {
                in: checked.map(order => order.clientRequestId),
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
        data: { nextOrderNumber: { increment: checked.length } },
        select: { nextOrderNumber: true },
    });

    const firstNumber =
        business.nextOrderNumber - checked.length + 1;

    const rows = checked.map((order, index) => ({
        ...order,
        number: firstNumber + index,
    }));

    for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);

        await tx.order.createMany({
            data: chunk.map(order => ({
                id: order.id,
                businessId,
                imported: true,
                customerId: order.customerId,
                number: order.number,
                clientRequestId: order.clientRequestId,
                publicAccessToken: createPublicOrderToken(),
                recipientPhone: order.data.contact.phone ?? "",
                recipientFirstName: order.data.contact.firstName,
                recipientLastName: order.data.contact.lastName,
                shippingAddress: order.data.contact.address,
                notes: order.data.notes,
                status: order.data.status,
                paymentStatus: order.paymentStatus,
                analyticsPendingCost: order.analyticsPendingCost,
                courierFee: new Prisma.Decimal(order.data.totals.courierFee),
                createdAt: order.createdAt,
            })),
        });

        await tx.orderItem.createMany({
            data: chunk.flatMap(order =>
                order.lines.map(({ source, id }) => ({
                    id,
                    orderId: order.id,
                    source: "MANUAL" as const,
                    condition: "GOOD" as const,
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
                    createdAt: order.createdAt,
                })),
            ),
        });

        const payments = chunk.filter(order =>
            order.paidAmount !== null &&
            order.paidAmount.greaterThan(0) &&
            order.receivedAt !== null,
        );

        if (payments.length > 0) {
            await tx.orderPayment.createMany({
                data: payments.map(order => ({
                    orderId: order.id,
                    amount: order.paidAmount!,
                    method: "UNKNOWN" as const,
                    createdAt: order.receivedAt!,
                })),
            });
        }
    }

    const sales = rows.filter(order =>
        order.data.status === "COMPLETED" &&
        !order.analyticsPendingCost,
    );

    for (let index = 0; index < sales.length; index += 200) {
        const chunk = sales.slice(index, index + 200);

        const financialOrders = await tx.order.findMany({
            where: { id: { in: chunk.map(order => order.id) } },
            include: orderWithStock,
        }).then(numericQuantities);

        const byId = new Map(
            financialOrders.map(order => [order.id, order]),
        );

        await recordNewOrderSaleSnapshots(
            tx,
            businessId,
            chunk.map(order => {
                const financialOrder = byId.get(order.id);

                if (!financialOrder) {
                    throw new Error("Imported order is missing");
                }

                return {
                    order: financialOrder,
                    snapshot: buildSaleSnapshot(financialOrder, new Map()),
                    eventKey: `import:${jobId}:${order.id}:sale`,
                    occurredAt: order.createdAt,
                };
            }),
        );
    }

    return rows.map(order => ({
        id: order.id,
        number: order.number,
        analyticsPendingCost: order.analyticsPendingCost,
        items: order.lines.map(({ source, id }) => ({
            orderItemId: id,
            sourceRowKey: source.rowKey,
            sourceProductCode: source.data.productCode,
        })),
    }));
}
