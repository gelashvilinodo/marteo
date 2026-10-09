import QRCode from "qrcode";
import { Prisma } from "@/generated/prisma/client";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function GET(
    request: Request,
    context: {
        params: Promise<{ orderId: string }>;
    },
) {
    let prisma:
        | ReturnType<typeof createPrismaClient>
        | undefined;

    try {
        const user = await getCurrentUser();

        if (!user) {
            return json(
                {
                    success: false,
                    message: "გაიარე ავტორიზაცია.",
                },
                401,
            );
        }

        const { orderId } = await context.params;

        prisma = createPrismaClient();

        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
                select: { businessId: true },
            });

        if (!membership) {
            return json(
                {
                    success: false,
                    message: "ბიზნესი ვერ მოიძებნა.",
                },
                403,
            );
        }

        const order = await prisma.order.findFirst({
            where: {
                id: orderId,
                businessId: membership.businessId,
                deletedAt: null,
            },
            select: {
                number: true,
                createdAt: true,
                status: true,
                paymentStatus: true,
                recipientFirstName: true,
                recipientLastName: true,
                recipientPhone: true,
                shippingAddress: true,
                courierFee: true,
                items: {
                    where: { isActive: true },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: {
                        name: true,
                        color: true,
                        size: true,
                        condition: true,
                        quantity: true,
                        unitPrice: true,
                    },
                },
                payments: { select: { amount: true } },
                publicAccessToken: true,
                invoiceVersion: true,
                lastPrintedInvoiceVersion: true,
                invoicePrintedAt: true,
                business: {
                    select: {
                        name: true,
                        logoUrl: true,
                        phone: true,
                        email: true,
                        address: true,
                    },
                },
            },
        });

        if (!order) {
            return json(
                {
                    success: false,
                    message: "შეკვეთა ვერ მოიძებნა.",
                },
                404,
            );
        }

        const publicUrl = order.publicAccessToken
            ? new URL(
                `/o/${order.publicAccessToken}`,
                request.url,
            ).toString()
            : null;

        const qrDataUrl = publicUrl
            ? await QRCode.toDataURL(publicUrl, {
                width: 320,
                margin: 4,
                errorCorrectionLevel: "M",
                color: {
                    dark: "#000000",
                    light: "#ffffff",
                },
            })
            : null;

        const printState =
            order.lastPrintedInvoiceVersion === null
                ? "NEW"
                : order.lastPrintedInvoiceVersion ===
                    order.invoiceVersion
                    ? "PRINTED"
                    : "UPDATED";

        const productsTotal = order.items.reduce(
            (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
            new Prisma.Decimal(0),
        );
        const total = productsTotal.plus(order.courierFee);
        const paidAmount = order.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Prisma.Decimal(0),
        );
        const invoice: OrderInvoiceData = {
            number: order.number,
            createdAt: order.createdAt.toISOString(),
            status: order.status,
            paymentStatus: order.paymentStatus,
            business: order.business,
            recipient: {
                name: [order.recipientFirstName, order.recipientLastName].filter(Boolean).join(" "),
                phone: order.recipientPhone,
                address: order.shippingAddress || "",
            },
            items: order.items.map(item => ({
                ...item,
                unitPrice: item.unitPrice.toFixed(2),
                total: item.unitPrice.mul(item.quantity).toFixed(2),
            })),
            productsTotal: productsTotal.toFixed(2),
            courierFee: order.courierFee.toFixed(2),
            total: total.toFixed(2),
            paidAmount: paidAmount.toFixed(2),
            remainingAmount: Prisma.Decimal.max(
                total.minus(paidAmount),
                0,
            ).toFixed(2),

            refundDue: Prisma.Decimal.max(
                paidAmount.minus(total),
                0,
            ).toFixed(2),
            publicUrl,
            qrDataUrl,
            version: order.invoiceVersion,
            printState,
            printedAt: order.invoicePrintedAt?.toISOString() ?? null,
        };
        return json({ success: true, invoice });
    } catch (error: unknown) {
        // ბმულის დაცულ კოდს ლოგებში არ ვბეჭდავთ.
        console.error(
            "Invoice preparation failed",
            error instanceof Error
                ? error.name
                : "UnknownError",
        );

        return json(
            {
                success: false,
                message:
                    "ინვოისის მომზადება ვერ მოხერხდა.",
            },
            500,
        );
    } finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
}