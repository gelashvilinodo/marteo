import QRCode from "qrcode";
import { Prisma } from "@/generated/prisma/client";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";
import { orderPayableTotal } from "@/lib/orders/order-payable-total";

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

    const startedAt = performance.now();
    let stageStartedAt = startedAt;

    function measure(stage: string) {
        const now = performance.now();

        console.info("Invoice timing", {
            stage,
            elapsedMs: Math.round((now - stageStartedAt) * 100) / 100,
            totalElapsedMs: Math.round((now - startedAt) * 100) / 100,
        });

        stageStartedAt = now;
    }

    try {
        const user = await getCurrentUser();
        measure("authentication");

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

        measure("membership");

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
                notes: true,
                courierFee: true,
                stockReturnedAt: true,
                fulfillmentCycle: true,
                returns: {
                    where: { status: "RECEIVED" },
                    select: {
                        fulfillmentCycle: true,
                        items: {
                            select: {
                                orderItemId: true,
                                quantity: true,
                            },
                        },
                    },
                },
                items: {
                    where: { isActive: true },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: {
                        id: true,
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

        measure("order-query");

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

        // დროებითი დიაგნოსტიკა: ჩვეულებრივ მოთხოვნაში QR რჩება.
        const skipQrForDiagnostic =
            new URL(request.url).searchParams.get("diagnostic") ===
            "skip-qr";

        const qrDataUrl = publicUrl && !skipQrForDiagnostic
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

        console.info("Invoice QR diagnostic", {
            mode: skipQrForDiagnostic ? "skip-qr" : "normal",
            hasPublicLink: Boolean(publicUrl),
        });

        measure("qr-generation");

        const printState =
            order.lastPrintedInvoiceVersion === null
                ? "NEW"
                : order.lastPrintedInvoiceVersion ===
                    order.invoiceVersion
                    ? "PRINTED"
                    : "UPDATED";

        const receivedQuantities = new Map<string, number>();

        for (const entry of order.returns) {
            if (entry.fulfillmentCycle !== order.fulfillmentCycle) {
                continue;
            }

            for (const item of entry.items) {
                receivedQuantities.set(
                    item.orderItemId,
                    (receivedQuantities.get(item.orderItemId) ?? 0) +
                    item.quantity,
                );
            }
        }

        const total = orderPayableTotal(
            order,
            receivedQuantities,
        );

        const productsTotal = total.minus(order.courierFee);

        const invoiceItems = order.items
            .map(item => ({
                ...item,
                quantity: order.stockReturnedAt
                    ? 0
                    : item.quantity -
                    (receivedQuantities.get(item.id) ?? 0),
            }))
            .filter(item => item.quantity > 0);
        const paidAmount = order.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Prisma.Decimal(0),
        );
        const invoice: OrderInvoiceData = {
            number: order.number,
            createdAt: order.createdAt.toISOString(),
            notes: order.notes ?? "",
            status: order.status,
            paymentStatus: order.paymentStatus,
            business: order.business,
            recipient: {
                name: [order.recipientFirstName, order.recipientLastName].filter(Boolean).join(" "),
                phone: order.recipientPhone,
                address: order.shippingAddress || "",
            },
            items: invoiceItems.map(item => ({
                name: item.name,
                color: item.color,
                size: item.size,
                condition: item.condition,
                quantity: item.quantity,
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
        measure("invoice-calculation");

        const response = json({ success: true, invoice });
        measure("response-serialization");

        return response;
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
            stageStartedAt = performance.now();
            await prisma.$disconnect();
            measure("database-disconnect");
        }
    }
}