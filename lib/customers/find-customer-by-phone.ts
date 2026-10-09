import "server-only";

import { Prisma } from "@/generated/prisma/client";

type CustomerMatch = {
    id: string;
    deletedAt: Date | null;
};

export async function findCustomerByPhone(
    tx: Prisma.TransactionClient,
    businessId: string,
    normalizedPhone: string,
): Promise<CustomerMatch[]> {
    const digits = normalizedPhone.slice(1);

    return tx.$queryRaw<CustomerMatch[]>(Prisma.sql`
        WITH normalized AS (
            SELECT
                "id",
                "phone",
                "deletedAt",
                "createdAt",
                regexp_replace(
                    regexp_replace(
                        "phone",
                        '[^0-9]',
                        '',
                        'g'
                    ),
                    '^00',
                    ''
                ) AS digits
            FROM "Customer"
            WHERE "businessId" = ${businessId}
        )
        SELECT "id", "deletedAt"
        FROM normalized
        WHERE
            CASE
                WHEN length(digits) = 9
                    AND left(digits, 1) = '5'
                THEN '995' || digits
                ELSE digits
            END = ${digits}
        ORDER BY
            ("deletedAt" IS NULL) DESC,
            CASE WHEN "phone" = ${normalizedPhone}
                THEN 0 ELSE 1 END,
            "createdAt" ASC,
            "id" ASC
    `);
}