import { numericQuantities } from "@/lib/orders/quantity";
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "./order-validation-error";
import {
    validatePaymentResolution,
} from "./validate-payment-resolution";
import {
    orderPayableTotal,
} from "./order-payable-total";
import {
    paymentState,
} from "./order-rules";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

// გამოიძახება მხოლოდ ავტორიზებული მოქმედების ტრანზაქციიდან,
// ბიზნესის დაბლოკვისა და შეკვეთის ვერსიის შემოწმების შემდეგ.
// განმეორებითი მოთხოვნისგან დაცვას მოქმედების გარე შრე უზრუნველყოფს.
export async function resolveHistoricalOrderPayment(
    tx: Prisma.TransactionClient,
    input: {
        businessId: string;
        orderId: string;
        payment: unknown;
    },
) {
    const order = await tx.order.findFirst({
        where: {
            id: input.orderId,
            businessId: input.businessId,
            deletedAt: null,
        },
        include: {
            items: {
                where: { isActive: true },
                select: {
                    id: true,
                    quantity: true,
                    unitPrice: true,
                },
            },
            payments: {
                select: { id: true },
            },
        },
    }).then(numericQuantities);

    if (!order) {
        fail("შეკვეთა ამ ბიზნესში ვერ მოიძებნა.", 404);
    }

    if (order.paymentStatus !== "UNKNOWN") {
        fail(
            "ამ შეკვეთის გადახდა უკვე განსაზღვრულია. ჩვეულებრივი გადახდისთვის გამოიყენე შესაბამისი მოქმედება.",
            409,
        );
    }

    if (
        !["PROCESSING", "SHIPPED"].includes(order.status) ||
        order.stockReturnedAt !== null ||
        order.deleteRequestedAt !== null
    ) {
        fail(
            "ამ მდგომარეობაში შეკვეთის ძველი გადახდის დაზუსტება დაუშვებელია.",
            409,
        );
    }

    const returns = await tx.orderReturn.count({
        where: {
            orderId: order.id,
            status: { in: ["PENDING", "RECEIVED"] },
        },
    });

    if (returns > 0) {
        fail(
            "შეკვეთაზე დაბრუნება მიმდინარეობს ან უკვე აღრიცხულია. გადახდის დაზუსტებამდე მისი თანხებიც გასათვალისწინებელია.",
            409,
        );
    }

    if (order.payments.length > 0) {
        fail(
            "დაუზუსტებელ შეკვეთაზე გადახდის ჩანაწერები უკვე არსებობს. მათ გვერდით ძველ თანხას ხელახლა ვერ დავამატებთ.",
            409,
        );
    }

    const total = orderPayableTotal(order, new Map());

    const payment = validatePaymentResolution(
        input.payment,
        total,
    );

    if (payment.paidAmount.greaterThan(0)) {
        if (payment.paymentDate === null) {
            throw new Error(
                "შემოწმებულ ისტორიულ გადახდას თარიღი აკლია.",
            );
        }

        // მომხმარებელი უთითებს დღეს საქართველოს დროით.
        // დღევანდელი თარიღით ძველ გადახდას არ ვაფიქსირებთ.
        const receivedAt = new Date(
            `${payment.paymentDate}T00:00:00+04:00`,
        );

        await tx.orderPayment.create({
            data: {
                orderId: order.id,
                amount: payment.paidAmount,
                method: payment.method,
                bankName: payment.bankName,
                createdAt: receivedAt,
            },
        });
    }

    const status = paymentState(
        total,
        payment.paidAmount,
        order.courierFee,
    );

    await tx.order.update({
        where: { id: order.id },
        data: {
            paymentStatus: status,
            invoiceVersion: { increment: 1 },
        },
    });

    return {
        paymentStatus: status,
        paidAmount: payment.paidAmount.toFixed(2),
        paymentDate: payment.paymentDate,
    };
}