import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

import {
    normalizeCustomerPhone,
    OrderValidationError,
} from "@/lib/orders/validate-order";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

type CustomerResult = {
    id: string;
    phone: string;
    firstName: string | null;
    lastName: string | null;
    address: string | null;
};

export async function GET(request: Request) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

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

        const url = new URL(request.url);
        const phone = normalizeCustomerPhone(
            url.searchParams.get("phone") ?? "",
        );

        prisma = createPrismaClient();

        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
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

        const digits = phone.slice(1);

        // ძველ ჩანაწერებშიც ვიპოვით ნომერს:
        // 599123456, +995599123456, 599 12 34 56...
        const customers = await prisma.$queryRaw<
            CustomerResult[]
        >(Prisma.sql`
            WITH normalized AS (
                SELECT
                    c."id",
                    c."phone",
                    c."firstName",
                    c."lastName",
                    c."address",
                    c."createdAt",
                    regexp_replace(
                        regexp_replace(
                            c."phone",
                            '[^0-9]',
                            '',
                            'g'
                        ),
                        '^00',
                        ''
                    ) AS digits
                FROM "Customer" c
    WHERE c."businessId" =
    ${membership.businessId}
    AND c."deletedAt" IS NULL
            )
            SELECT
                "id",
                "phone",
                "firstName",
                "lastName",
                "address"
            FROM normalized
            WHERE
                CASE
                    WHEN length(digits) = 9
                         AND left(digits, 1) = '5'
                    THEN '995' || digits
                    ELSE digits
                END = ${digits}
            ORDER BY
                CASE WHEN "phone" = ${phone}
                     THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
            LIMIT 1
        `);

        const customer = customers[0];

        return json({
            success: true,
            customer: customer
                ? {
                    id: customer.id,
                    phone,
                    firstName: customer.firstName ?? "",
                    lastName: customer.lastName ?? "",
                    address: customer.address ?? "",
                }
                : null,
        });
    } catch (error: unknown) {
        if (error instanceof OrderValidationError) {
            return json(
                {
                    success: false,
                    message: error.message,
                },
                error.status,
            );
        }

        console.error("Order customer lookup error", error);

        return json(
            {
                success: false,
                message: "კლიენტის მოძებნა ვერ მოხერხდა.",
            },
            500,
        );
    } finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
}