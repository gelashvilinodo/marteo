import { Prisma } from "@/generated/prisma/client";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { readOrderBody } from "@/lib/orders/order-http";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

type ExistingCustomer = {
    id: string;
    phone: string;
    normalizedPhone: string;
    firstName: string | null;
    lastName: string | null;
    address: string | null;
    deletedAt: Date | null;
    updatedAt: Date;
};

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return json({
                success: false,
                message: "შემოწმებისთვის გაიარე ავტორიზაცია.",
            }, 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return json({
                success: false,
                message: "შემოწმებისთვის ბიზნესი ვერ მოიძებნა.",
            }, 403);
        }

        const raw = await readOrderBody(request);

        if (
            typeof raw !== "object" ||
            raw === null ||
            Array.isArray(raw)
        ) {
            return json({
                success: false,
                message: "შემოწმების მონაცემების ფორმატი არასწორია.",
            }, 422);
        }

        const body = raw as Record<string, unknown>;

        if (
            !Array.isArray(body.phones) ||
            body.phones.length > 500 ||
            body.phones.some(
                phone =>
                    typeof phone !== "string" ||
                    !/^\+[1-9]\d{7,14}$/.test(phone),
            )
        ) {
            return json({
                success: false,
                message:
                    "ერთ მოთხოვნაში გამოაგზავნე მაქსიმუმ 500 სწორ ფორმატში მომზადებული ტელეფონი.",
            }, 422);
        }

        const phones = [
            ...new Set(body.phones as string[]),
        ];

        const prisma = createPrismaClient();

        try {
            const access =
                await prisma.businessMembership.findUnique({
                    where: {
                        userId_businessId: {
                            userId: user.id,
                            businessId: membership.businessId,
                        },
                    },
                    select: { role: true },
                });

            if (
                !access ||
                !["OWNER", "ADMIN"].includes(access.role)
            ) {
                return json({
                    success: false,
                    message:
                        "იმპორტის შემოწმება ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                }, 403);
            }

            if (phones.length === 0) {
                return json({
                    success: true,
                    businessId: membership.businessId,
                    checkedPhones: [],
                    matches: [],
                });
            }

            const digits = phones.map(phone => phone.slice(1));

            const matches =
                await prisma.$queryRaw<ExistingCustomer[]>(
                    Prisma.sql`
                        WITH normalized AS (
                            SELECT
                                "id",
                                "phone",
                                "firstName",
                                "lastName",
                                "address",
                                "deletedAt",
                                "updatedAt",
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
                            WHERE
                                "businessId" = ${membership.businessId}
                        ),
                        canonical AS (
                            SELECT
                                *,
                                CASE
                                    WHEN length(digits) = 9
                                        AND left(digits, 1) = '5'
                                    THEN '995' || digits
                                    ELSE digits
                                END AS normalized_digits
                            FROM normalized
                        )
                        SELECT
                            "id",
                            "phone",
                            '+' || normalized_digits
                                AS "normalizedPhone",
                            "firstName",
                            "lastName",
                            "address",
                            "deletedAt",
                            "updatedAt"
                        FROM canonical
                        WHERE normalized_digits IN (
                            ${Prisma.join(digits)}
                        )
                        ORDER BY
                            normalized_digits ASC,
                            ("deletedAt" IS NULL) DESC,
                            "id" ASC
                    `,
                );

            return json({
                success: true,
                businessId: membership.businessId,
                checkedPhones: phones,
                matches,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) {
            return json({
                success: false,
                message: cause.message,
            }, cause.status);
        }

        console.error(
            "Import customer check failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "MARTEO-ში არსებული მომხმარებლების შემოწმება ვერ დასრულდა. ეს ფაილის შეცდომას არ ნიშნავს. მონაცემები არ შეცვლილა - სცადე ხელახლა.",
        }, 500);
    }
}