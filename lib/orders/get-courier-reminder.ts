import "server-only";

import type {
    OrderRecordQueryClient,
} from "./get-order-records";

import {
    calculateCourierBalance,
    type CourierBalance,
} from "./calculate-courier-balance";

export type CourierReminder = {
    enabled: boolean;
    startDate: string | null;
    orderCount: number;
    unresolvedOrderCount: number;
    canSettle: boolean;
    balance: CourierBalance;
};

type ReminderRow = {
    startDate: string | null;
    orderCount: number;
    unresolvedOrderCount: number;
    courierFees: string;
    cashReceived: string;
    paidToCourier: string;
    receivedFromCourierSigned: string;
};

export async function getCourierReminder(
    client: Pick<OrderRecordQueryClient, "$queryRaw">,
    businessId: string,
): Promise<CourierReminder> {
    const [row] = await client.$queryRaw<ReminderRow[]>`
        WITH business_scope AS (
            SELECT
                b.id,
                b."courierReminderStartDate"::text AS start_date,
                (
                    b."courierReminderStartDate"::timestamp
                    AT TIME ZONE 'Asia/Tbilisi'
                    AT TIME ZONE 'UTC'
                ) AS start_at
            FROM "Business" b
            WHERE b.id = ${businessId}
        ),
        candidate_orders AS (
            SELECT
                o.id,
                o."courierFee",
                o."paymentStatus"
            FROM "Order" o
            JOIN business_scope b
                ON b.id = o."businessId"
            WHERE b.start_at IS NOT NULL
                AND o."createdAt" >= b.start_at
                AND o."deletedAt" IS NULL
                AND o.status = 'COMPLETED'
                AND o."courierFee" > 0
        ),
        order_payments AS (
            SELECT
                p."orderId",
                COALESCE(
                    SUM(p.amount)
                        FILTER (WHERE p.method = 'CASH'),
                    0
                ) AS cash_received,
                BOOL_OR(
                    p.method = 'UNKNOWN'
                    AND p.amount <> 0
                ) AS unknown_method,
                COUNT(*) AS payment_count
            FROM "OrderPayment" p
            JOIN candidate_orders o
                ON o.id = p."orderId"
            GROUP BY p."orderId"
        ),
        classified_orders AS (
            SELECT
                o.id,
                o."courierFee",
                COALESCE(p.cash_received, 0) AS cash_received,
                (
                    o."paymentStatus" = 'PAID'
                    AND COALESCE(p.payment_count, 0) > 0
                    AND NOT COALESCE(p.unknown_method, FALSE)
                    AND COALESCE(p.cash_received, 0) >= 0
                ) AS ready
            FROM candidate_orders o
            LEFT JOIN order_payments p
                ON p."orderId" = o.id
        ),
        order_totals AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE ready
                )::int AS order_count,

                COUNT(*) FILTER (
                    WHERE NOT ready
                )::int AS unresolved_count,

                COALESCE(
                    SUM("courierFee") FILTER (WHERE ready),
                    0
                ) AS courier_fees,

                COALESCE(
                    SUM(cash_received) FILTER (WHERE ready),
                    0
                ) AS cash_received
            FROM classified_orders
        ),
        settlement_totals AS (
            SELECT
                COALESCE(
                    SUM(s.amount) FILTER (WHERE s.amount > 0),
                    0
                ) AS paid_to_courier,

                COALESCE(
                    SUM(s.amount) FILTER (WHERE s.amount < 0),
                    0
                ) AS received_from_courier_signed
            FROM "CourierSettlement" s
            JOIN business_scope b
                ON b.id = s."businessId"
            WHERE b.start_at IS NOT NULL
                AND s."createdAt" >= b.start_at
        )
        SELECT
            b.start_date AS "startDate",
            o.order_count AS "orderCount",
            o.unresolved_count AS "unresolvedOrderCount",
            o.courier_fees::text AS "courierFees",
            o.cash_received::text AS "cashReceived",
            s.paid_to_courier::text AS "paidToCourier",
            s.received_from_courier_signed::text
                AS "receivedFromCourierSigned"
        FROM business_scope b
        CROSS JOIN order_totals o
        CROSS JOIN settlement_totals s
    `;

    if (!row) {
        throw new Error("ბიზნესი ვერ მოიძებნა.");
    }

    const enabled = row.startDate !== null;

    const balance = calculateCourierBalance({
        orders: [{
            courierFee: row.courierFees,
            cashReceived: row.cashReceived,
        }],
        settlements: [
            row.paidToCourier,
            row.receivedFromCourierSigned,
        ],
    });

    return {
        enabled,
        startDate: row.startDate,
        orderCount: row.orderCount,
        unresolvedOrderCount: row.unresolvedOrderCount,
        canSettle:
            enabled &&
            row.unresolvedOrderCount === 0 &&
            balance.direction !== "SETTLED",
        balance,
    };
}