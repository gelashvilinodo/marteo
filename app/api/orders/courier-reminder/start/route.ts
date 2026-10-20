import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    getCourierReminder,
} from "@/lib/orders/get-courier-reminder";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

function readStartDate(value: unknown): string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        throw new OrderValidationError(
            "აირჩიე შეხსენების დაწყების თარიღი.",
            422,
        );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new OrderValidationError(
            "მითითებული თარიღი არასწორია.",
            422,
        );
    }

    const today = new Date(
        Date.now() + 4 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);

    if (value > today) {
        throw new OrderValidationError(
            "დაწყების თარიღი მომავალში ვერ იქნება.",
            422,
        );
    }

    return value;
}

export async function POST(request: Request) {
    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            throw new OrderValidationError(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const contentType = request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase();

        if (contentType !== "application/json") {
            throw new OrderValidationError(
                "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
                415,
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            throw new OrderValidationError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            throw new OrderValidationError(
                "ბიზნესი ვერ მოიძებნა.",
                403,
            );
        }

        const text = await request.text();

        if (text.length > 2048) {
            throw new OrderValidationError(
                "გამოგზავნილი მონაცემები ზედმეტად დიდია.",
                413,
            );
        }

        let body: unknown;

        try {
            body = JSON.parse(text);
        } catch {
            throw new OrderValidationError(
                "მონაცემების ფორმატი არასწორია.",
                400,
            );
        }

        if (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            throw new OrderValidationError(
                "მონაცემების ფორმატი არასწორია.",
                400,
            );
        }

        const startDate = readStartDate(
            (body as Record<string, unknown>).startDate,
        );

        const prisma = createPrismaClient();

        try {
            const reminder = await prisma.$transaction(
                async tx => {
                    const [business] = await tx.$queryRaw<
                        Array<{
                            id: string;
                            startDate: string | null;
                        }>
                    >(Prisma.sql`
                        SELECT
                            id,
                            "courierReminderStartDate"::text
                                AS "startDate"
                        FROM "Business"
                        WHERE id = ${membership.businessId}
                        FOR UPDATE
                    `);

                    if (!business) {
                        throw new OrderValidationError(
                            "ბიზნესი ვერ მოიძებნა.",
                            404,
                        );
                    }

                    const access =
                        await tx.businessMembership.findUnique({
                            where: {
                                userId_businessId: {
                                    userId: user.id,
                                    businessId: membership.businessId,
                                },
                            },
                            select: {
                                role: true,
                            },
                        });

                    if (
                        !access ||
                        !["OWNER", "ADMIN"].includes(access.role)
                    ) {
                        throw new OrderValidationError(
                            "ამ მოქმედებისთვის შესაბამისი უფლება არ გაქვს.",
                            403,
                        );
                    }

                    if (
                        business.startDate !== null &&
                        business.startDate !== startDate
                    ) {
                        throw new OrderValidationError(
                            "შეხსენება უკვე ჩართულია სხვა თარიღიდან. დაწყების თარიღი აღარ შეიცვლება.",
                            409,
                        );
                    }

                    if (business.startDate === null) {
                        await tx.business.update({
                            where: {
                                id: membership.businessId,
                            },
                            data: {
                                courierReminderStartDate:
                                    new Date(
                                        `${startDate}T00:00:00.000Z`,
                                    ),
                            },
                        });
                    }

                    return getCourierReminder(
                        tx,
                        membership.businessId,
                    );
                },
                {
                    isolationLevel: "ReadCommitted",
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            );

            return json({
                success: true,
                reminder,
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

        console.error("Courier reminder activation failed");

        return json({
            success: false,
            message:
                "შეხსენების ჩართვის შედეგი ვერ დადასტურდა. იგივე თარიღით ხელახლა სცადე.",
        }, 500);
    }
}