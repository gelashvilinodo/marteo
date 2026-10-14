import type { Prisma } from "@/generated/prisma/client";

type SummaryRow = {
    grouped: Array<{ status: string; count: number }>;
    newCount: bigint;
    updatedCount: bigint;
};

export async function getOrdersSummary(
    client: Pick<Prisma.TransactionClient, "$queryRaw">,
    businessId: string,
    start: Date,
    end: Date,
) {
    const [row] = await client.$queryRaw<SummaryRow[]>`
        WITH period_counts AS (
            SELECT status::text AS status, COUNT(*) AS count
            FROM "Order"
            WHERE "businessId" = ${businessId} AND "deletedAt" IS NULL
                AND "createdAt" >= ${start} AND "createdAt" < ${end}
            GROUP BY status
        )
        SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count))
            FROM period_counts), '[]'::jsonb) AS grouped,
            COUNT(*) FILTER (WHERE "lastPrintedInvoiceVersion" IS NULL) AS "newCount",
            COUNT(*) FILTER (WHERE "lastPrintedInvoiceVersion" IS NOT NULL
                AND "lastPrintedInvoiceVersion" <> "invoiceVersion") AS "updatedCount"
        FROM "Order"
        WHERE "businessId" = ${businessId} AND "deletedAt" IS NULL AND status <> 'CANCELED'
    `;
    return {
        grouped: (row?.grouped ?? []).map(group => ({ status: group.status, _count: { _all: Number(group.count) } })),
        invoiceCounts: { new: Number(row?.newCount ?? 0), updated: Number(row?.updatedCount ?? 0) },
    };
}
