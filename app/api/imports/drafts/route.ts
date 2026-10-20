import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { readOrderBody } from "@/lib/orders/order-http";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

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
                message: "მონახაზის შესანახად გაიარე ავტორიზაცია.",
            }, 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return json({
                success: false,
                message: "მონახაზის შესანახად ბიზნესი ვერ მოიძებნა.",
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
                message: "მონახაზის მოთხოვნის ფორმატი არასწორია.",
            }, 422);
        }

        const body = raw as Record<string, unknown>;

        if (
            typeof body.clientRequestId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                body.clientRequestId,
            )
        ) {
            return json({
                success: false,
                message:
                    "მონახაზის მოთხოვნის იდენტიფიკატორი არასწორია.",
            }, 422);
        }

        const clientRequestId = body.clientRequestId.toLowerCase();
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(async tx => {
                const access =
                    await tx.businessMembership.findUnique({
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
                    throw new OrderValidationError(
                        "იმპორტის მონახაზი ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                        403,
                    );
                }

                await tx.$queryRaw`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${membership.businessId}
                    FOR UPDATE
                `;

                const existing = await tx.importJob.findUnique({
                    where: {
                        businessId_clientRequestId: {
                            businessId: membership.businessId,
                            clientRequestId,
                        },
                    },
                    select: {
                        id: true,
                        businessId: true,
                        status: true,
                        schemaVersion: true,
                        revision: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                });

                if (existing) {
                    return {
                        created: false,
                        draft: existing,
                    };
                }

                const draft = await tx.importJob.create({
                    data: {
                        businessId: membership.businessId,
                        createdByUserId: user.id,
                        clientRequestId,
                        status: "DRAFT",
                        schemaVersion: 1,
                    },
                    select: {
                        id: true,
                        businessId: true,
                        status: true,
                        schemaVersion: true,
                        revision: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                });

                return {
                    created: true,
                    draft,
                };
            });

            return json({
                success: true,
                ...result,
            }, result.created ? 201 : 200);
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
            "Import draft creation failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "მონახაზის შექმნის შედეგი ვერ დადასტურდა. ხელახლა ცდისას იგივე მოთხოვნას გამოვიყენებთ, რომ მეორე მონახაზი არ შეიქმნას. ეს ფაილის შიგთავსის შეცდომას არ ნიშნავს.",
        }, 500);
    }
}

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return json({
                success: false,
                message: "მონახაზების სანახავად გაიარე ავტორიზაცია.",
            }, 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return json({
                success: false,
                message: "ბიზნესი ვერ მოიძებნა.",
            }, 403);
        }

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
                        "მონახაზები ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                }, 403);
            }

            const drafts = await prisma.importJob.findMany({
                where: {
                    businessId: membership.businessId,
                    status: {
                        in: ["DRAFT", "REVIEW", "PARTIAL"],
                    },
                    schemaVersion: 1,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
                orderBy: [
                    { updatedAt: "desc" },
                    { id: "desc" },
                ],
                take: 20,
                select: {
                    id: true,
                    status: true,
                    revision: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: { files: true },
                    },
                },
            });

            return json({
                success: true,
                businessId: membership.businessId,
                drafts,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        console.error(
            "Import draft list failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "მონახაზების სია ვერ ჩაიტვირთა. შენახული მონაცემები არ შეცვლილა — სცადე ხელახლა.",
        }, 500);
    }
}