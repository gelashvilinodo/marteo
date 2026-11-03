import "server-only";
import { canManageBusinessArea } from "@/lib/business/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { findActiveMembership } from "@/lib/auth/active-business";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "./validate-order";

function fail(message: string, status = 400): never {
    throw new OrderValidationError(message, status);
}

// დასრულებული და გაუქმებული შეკვეთები ერთი მოთხოვნით იშლება, თითოეულის ცალკე შემოწმების გარეშე.
// SQL-ის პირობა იგივე წესებს იმეორებს, რასაც ცალკე წაშლა ამოწმებს: თუ შეკვეთაზე დაბრუნება,
// დასაბრუნებელი/მისაღები თანხა ან მომხმარებელთან დარჩენილი ნივთია, ის აქ არ იშლება
// და კლიენტი მას ჩვეულებრივი გზით ამოწმებს.
export async function deleteSettledOrders(raw: unknown) {
    const user = await getCurrentUser();
    if (!user) fail("გაიარე ავტორიზაცია.", 401);

    const ids = typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).orderIds
        : undefined;
    if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > 500 ||
        ids.some(id => typeof id !== "string" || id.length > 64)
    ) {
        fail("შეკვეთების სია არასწორია.", 422);
    }
    const orderIds = [...new Set(ids as string[])];

    const prisma = createPrismaClient();
    try {
        const membership = await findActiveMembership(prisma, user.id);
        if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);
        if (!canManageBusinessArea(membership, "ORDERS")) {
            fail("ამ მოქმედების უფლება არ გაქვს.", 403);
        }
        const businessId = membership.businessId;

        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;

            const deleted = await tx.$queryRaw<Array<{ id: string }>>`
                WITH settled AS (
                    SELECT o.id
                    FROM "Order" o
                    CROSS JOIN LATERAL (
                        SELECT COALESCE(SUM(p.amount), 0) AS paid
                        FROM "OrderPayment" p WHERE p."orderId" = o.id
                    ) pay
                    CROSS JOIN LATERAL (
                        SELECT o."courierFee" + COALESCE(SUM(ROUND(i."unitPrice" * i.quantity, 2)), 0) AS payable
                        FROM "OrderItem" i WHERE i."orderId" = o.id AND i."isActive"
                    ) total
                    WHERE o.id = ANY(${orderIds}::text[])
                        AND o."businessId" = ${businessId}
                        AND o."deletedAt" IS NULL
                        AND o."deleteRequestedAt" IS NULL
                        AND NOT EXISTS (
                            SELECT 1 FROM "OrderReturn" r
                            WHERE r."orderId" = o.id
                                AND (r.status = 'PENDING' OR r."fulfillmentCycle" = o."fulfillmentCycle")
                        )
                        AND (
                            (o.status = 'COMPLETED' AND o."stockReturnedAt" IS NULL AND pay.paid = total.payable)
                            OR (o.status = 'CANCELED' AND o."stockReturnedAt" IS NOT NULL AND pay.paid <= o."courierFee")
                        )
                )
                UPDATE "Order" o
                SET "deletedAt" = now(),
                    "publicAccessToken" = NULL,
                    "invoiceVersion" = o."invoiceVersion" + 1,
                    "updatedAt" = now()
                FROM settled
                WHERE o.id = settled.id
                RETURNING o.id
            `;

            // ხელახლა ცდისას უკვე წაშლილი შეკვეთებიც წაშლილად ითვლება.
            const alreadyDeleted = await tx.order.findMany({
                where: {
                    id: { in: orderIds },
                    businessId,
                    deletedAt: { not: null },
                },
                select: { id: true },
            });

            return {
                deletedIds: [...new Set([
                    ...deleted.map(row => row.id),
                    ...alreadyDeleted.map(row => row.id),
                ])],
            };
        }, { maxWait: 10000, timeout: 60000 });
    } finally { await prisma.$disconnect(); }
}
