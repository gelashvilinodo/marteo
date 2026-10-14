import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import type { OrderInvoiceData } from "./invoice-types";

type InvoiceOrderRow = {
    number: number | null;
    createdAt: Date;
    status: OrderInvoiceData["status"];
    paymentStatus: OrderInvoiceData["paymentStatus"];
    recipientFirstName: string | null;
    recipientLastName: string | null;
    recipientPhone: string;
    shippingAddress: string | null;
    notes: string | null;
    courierFee: string;
    stockReturnedAt: Date | null;
    fulfillmentCycle: number;
    publicAccessToken: string | null;
    invoiceVersion: number;
    lastPrintedInvoiceVersion: number | null;
    invoicePrintedAt: Date | null;
    business: OrderInvoiceData["business"];
    items: Array<{
        id: string;
        name: string;
        color: string | null;
        size: string | null;
        condition: OrderInvoiceData["items"][number]["condition"];
        quantity: number;
        unitPrice: string;
    }>;
    returns: Array<{
        fulfillmentCycle: number;
        items: Array<{ orderItemId: string; quantity: number }>;
    }>;
    paidAmount: string;
};

// One database snapshot and round trip. Monetary values remain decimal strings.
export async function getInvoiceOrder(
    client: ReturnType<typeof createPrismaClient>,
    businessId: string,
    orderId: string,
) {
    const [row] = await client.$queryRaw<InvoiceOrderRow[]>`
        SELECT
            o."number", o."createdAt", o."status"::text AS "status",
            o."paymentStatus"::text AS "paymentStatus",
            o."recipientFirstName", o."recipientLastName", o."recipientPhone",
            o."shippingAddress", o."notes", o."courierFee"::text AS "courierFee",
            o."stockReturnedAt", o."fulfillmentCycle", o."publicAccessToken",
            o."invoiceVersion", o."lastPrintedInvoiceVersion", o."invoicePrintedAt",
            jsonb_build_object(
                'name', b."name", 'logoUrl', b."logoUrl", 'phone', b."phone",
                'email', b."email", 'address', b."address"
            ) AS "business",
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', i."id", 'name', i."name", 'color', i."color",
                    'size', i."size", 'condition', i."condition",
                    'quantity', i."quantity", 'unitPrice', i."unitPrice"::text
                ) ORDER BY i."createdAt", i."id")
                FROM "OrderItem" i
                WHERE i."orderId" = o."id" AND i."isActive" = true
            ), '[]'::jsonb) AS "items",
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'fulfillmentCycle', r."fulfillmentCycle",
                    'items', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'orderItemId', ri."orderItemId", 'quantity', ri."quantity"
                        ))
                        FROM "OrderReturnItem" ri WHERE ri."returnId" = r."id"
                    ), '[]'::jsonb)
                ))
                FROM "OrderReturn" r
                WHERE r."orderId" = o."id" AND r."status" = 'RECEIVED'
                    AND r."fulfillmentCycle" = o."fulfillmentCycle"
            ), '[]'::jsonb) AS "returns",
            COALESCE((
                SELECT SUM(p."amount") FROM "OrderPayment" p
                WHERE p."orderId" = o."id"
            ), 0)::text AS "paidAmount"
        FROM "Order" o
        JOIN "Business" b ON b."id" = o."businessId"
        WHERE o."id" = ${orderId} AND o."businessId" = ${businessId}
            AND o."deletedAt" IS NULL
        LIMIT 1
    `;

    if (!row) return null;

    return {
        ...row,
        courierFee: new Prisma.Decimal(row.courierFee),
        paidAmount: new Prisma.Decimal(row.paidAmount),
        items: row.items.map(item => ({
            ...item,
            unitPrice: new Prisma.Decimal(item.unitPrice),
        })),
    };
}
