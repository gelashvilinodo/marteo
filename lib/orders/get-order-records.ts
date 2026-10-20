import { Decimal, join, sql } from "@prisma/client-runtime-utils";

export type OrderRecordQueryClient = {
    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
    $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

type ItemRow = {
    id: string; name: string; quantity: number; imageUrl: string | null;
    source: "MANUAL" | "INVENTORY"; unitPrice: string; totalCost: string | null;
    stockRestoredAt: string | null; inventoryItemId: string | null;
    condition: "GOOD" | "DEFECTIVE"; description: string | null;
    color: string | null; size: string | null; unitCost: string;
};
type RecordRow = {
    id: string; number: number | null; recipientPhone: string;
    recipientFirstName: string | null; recipientLastName: string | null;
    shippingAddress: string | null; notes: string | null;
    status: "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELED" | "RETURNED";
    paymentStatus: "PAID" | "UNPAID" | "PARTIALLY_PAID" | "COURIER_ONLY_PAID" | "UNKNOWN";
    courierFee: string; stockReturnedAt: Date | null; deleteRequestedAt: Date | null;
    fulfillmentCycle: number; createdAt: Date; updatedAt: Date;
    invoiceVersion: number; lastPrintedInvoiceVersion: number | null; invoicePrintedAt: Date | null;
    items: ItemRow[];
    returns: Array<{ status: "PENDING" | "RECEIVED"; fulfillmentCycle: number; items: Array<{ orderItemId: string; quantity: number }> }>;
    payments: Array<{ id: string; amount: string; method: "CASH" | "BANK_TRANSFER" | "CARD" | "UNKNOWN"; bankName: string | null; createdAt: string }>;
    paidAmount: string;
};

// Prisma DateTime is stored as a UTC timestamp without a timezone. JSON does
// not carry that contract, so normalize it explicitly on local and Worker hosts.
function utcDate(value: string) {
    return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
}

// Accepts both a request client and a RepeatableRead transaction client.
export async function getOrderRecords(
    client: OrderRecordQueryClient,
    businessId: string,
    orderIds: string[],
    details: boolean,
) {
    if (!orderIds.length) return [];
    const query = <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
        if (client.$queryRawUnsafe) {
            // Build trusted SQL with the same tag, then bind all values separately.
            // This avoids passing Sql class instances across Next bundle boundaries.
            const statement = sql(strings, ...values);
            return client.$queryRawUnsafe<T>(statement.text, ...statement.values);
        }
        return client.$queryRaw<T>(strings, ...values);
    };
    const rows = await query<RecordRow[]>`
        SELECT o.id, o.number, o."recipientPhone", o."recipientFirstName", o."recipientLastName",
            o."shippingAddress", o.notes, o.status::text AS status,
            o."paymentStatus"::text AS "paymentStatus", o."courierFee"::text AS "courierFee",
            o."stockReturnedAt", o."deleteRequestedAt", o."fulfillmentCycle", o."createdAt", o."updatedAt",
            o."invoiceVersion", o."lastPrintedInvoiceVersion", o."invoicePrintedAt",
            COALESCE((SELECT jsonb_agg(
                jsonb_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity,
                    'imageUrl', i."imageUrl", 'source', i.source, 'unitPrice', i."unitPrice"::text,
                    'totalCost', i."totalCost"::text, 'stockRestoredAt', i."stockRestoredAt")
                || CASE WHEN ${details} THEN jsonb_build_object(
                    'inventoryItemId', i."inventoryItemId", 'condition', i.condition,
                    'description', i.description, 'color', i.color, 'size', i.size, 'unitCost', i."unitCost"::text
                ) ELSE '{}'::jsonb END ORDER BY i."createdAt", i.id)
                FROM "OrderItem" i WHERE i."orderId" = o.id AND i."isActive" = true
            ), '[]'::jsonb) AS items,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'status', r.status, 'fulfillmentCycle', r."fulfillmentCycle",
                'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('orderItemId', ri."orderItemId", 'quantity', ri.quantity))
                    FROM "OrderReturnItem" ri WHERE ri."returnId" = r.id), '[]'::jsonb)))
                FROM "OrderReturn" r WHERE r."orderId" = o.id AND r.status IN ('PENDING', 'RECEIVED')
            ), '[]'::jsonb) AS returns,
            CASE WHEN ${details} THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'amount', p.amount::text, 'method', p.method, 'bankName', p."bankName", 'createdAt', p."createdAt"
            ) ORDER BY p."createdAt", p.id) FROM "OrderPayment" p WHERE p."orderId" = o.id), '[]'::jsonb)
            ELSE '[]'::jsonb END AS payments,
            COALESCE((SELECT SUM(p.amount) FROM "OrderPayment" p WHERE p."orderId" = o.id), 0)::text AS "paidAmount"
        FROM "Order" o WHERE o."businessId" = ${businessId} AND o."deletedAt" IS NULL
            AND o.id IN (${join(orderIds)})
    `;
    const byId = new Map(rows.map(row => [row.id, row]));
    return orderIds.flatMap(id => {
        const row = byId.get(id);
        if (!row) return [];
        return [{
            ...row,
            courierFee: new Decimal(row.courierFee),
            paidAmount: new Decimal(row.paidAmount),
            items: row.items.map(item => ({
                ...item,
                unitPrice: new Decimal(item.unitPrice),
                totalCost: item.totalCost === null ? null : new Decimal(item.totalCost),
                stockRestoredAt: item.stockRestoredAt ? utcDate(item.stockRestoredAt) : null,
                // Detail-only fields are never serialized for list rows.
                unitCost: details ? new Decimal(item.unitCost) : new Decimal(0),
            })),
            payments: row.payments.map(payment => ({ ...payment, amount: new Decimal(payment.amount), createdAt: utcDate(payment.createdAt) })),
        }];
    });
}
export type OrderRecord = Awaited<ReturnType<typeof getOrderRecords>>[number];
