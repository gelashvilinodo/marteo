import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    getCourierReminder,
} from "@/lib/orders/get-courier-reminder";
import {
    settleCourierReminder,
} from "@/lib/orders/settle-courier-reminder";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

function failure(cause: unknown) {
    if (cause instanceof OrderValidationError) {
        return json({
            success: false,
            message: cause.message,
        }, cause.status);
    }

    console.error("Courier reminder request failed");

    return json({
        success: false,
        message:
            "საკურიეროს მონაცემების დამუშავების შედეგი ვერ დადასტურდა.",
    }, 500);
}

async function getContext() {
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

    return {
        userId: user.id,
        businessId: membership.businessId,
    };
}

async function readBody(
    request: Request,
): Promise<Record<string, unknown>> {
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

    const text = await request.text();

    if (new TextEncoder().encode(text).byteLength > 4096) {
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

    return body as Record<string, unknown>;
}

export async function GET() {
    try {
        const context = await getContext();
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(
                async tx => {
                    const access =
                        await tx.businessMembership.findUnique({
                            where: {
                                userId_businessId: context,
                            },
                            select: {
                                role: true,
                            },
                        });

                    if (!access) {
                        throw new OrderValidationError(
                            "ამ ბიზნესზე წვდომა არ გაქვს.",
                            403,
                        );
                    }

                    return {
                        reminder: await getCourierReminder(
                            tx,
                            context.businessId,
                        ),
                        canManage: ["OWNER", "ADMIN"].includes(
                            access.role,
                        ),
                    };
                },
                {
                    isolationLevel: "RepeatableRead",
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            );

            return json({
                success: true,
                ...result,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return failure(cause);
    }
}

export async function POST(request: Request) {
    try {
        const context = await getContext();
        const body = await readBody(request);
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(
                tx => settleCourierReminder(tx, {
                    ...context,
                    clientRequestId: body.clientRequestId,
                    confirmed: body.confirmed,
                    expectedReminder: body.expectedReminder,
                }),
                {
                    isolationLevel: "ReadCommitted",
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            );

            return json({
                success: true,
                ...result,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return failure(cause);
    }
}