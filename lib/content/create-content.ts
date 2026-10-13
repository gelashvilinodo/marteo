import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "@/lib/orders/validate-order";
import {
    contentBody,
    contentRequestId,
    validateContent,
} from "./validate-content";

export async function createContent(raw: unknown) {
    if (!(await getCurrentUser())) {
        throw new OrderValidationError("გაიარე ავტორიზაცია.", 401);
    }

    const membership = await getCurrentBusiness();

    if (!membership) {
        throw new OrderValidationError("ბიზნესი ვერ მოიძებნა.", 403);
    }

    const body = contentBody(raw);
    const requestId = contentRequestId(body.requestId);
    const input = validateContent(body);
    const prisma = createPrismaClient();

    try {
        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`
                SELECT id
                FROM "Business"
                WHERE id = ${membership.businessId}
                FOR UPDATE
            `;

            const existing = await tx.contentItem.findUnique({
                where: { id: requestId },
                select: {
                    id: true,
                    businessId: true,
                    title: true,
                    description: true,
                    type: true,
                    customType: true,
                    scheduledAt: true,
                    materialUrl: true,
                    channels: {
                        select: {
                            platform: true,
                            customPlatform: true,
                        },
                    },
                },
            });

            if (existing) {
                const samePlatforms =
                    existing.channels.length === input.platforms.length &&
                    existing.channels.every(channel =>
                        input.platforms.some(
                            platform => platform === channel.platform,
                        ),
                    );

                const sameCustomPlatform =
                    (existing.channels.find(
                        channel => channel.platform === "OTHER",
                    )?.customPlatform ?? null) === input.customPlatform;

                const same =
                    existing.businessId === membership.businessId &&
                    existing.title === input.title &&
                    existing.description === input.description &&
                    existing.type === input.type &&
                    existing.customType === input.customType &&
                    existing.scheduledAt?.getTime() ===
                    input.scheduledAt.getTime() &&
                    existing.materialUrl === input.materialUrl &&
                    sameCustomPlatform &&
                    samePlatforms;

                if (!same) {
                    throw new OrderValidationError(
                        "იგივე მოთხოვნის კოდი განსხვავებულ მონაცემებზეა გამოყენებული.",
                        409,
                    );
                }

                return {
                    id: existing.id,
                    alreadySaved: true,
                };
            }

            const content = await tx.contentItem.create({
                data: {
                    id: requestId,
                    businessId: membership.businessId,
                    title: input.title,
                    description: input.description,
                    type: input.type,
                    customType: input.customType,
                    status: "SCHEDULED",
                    scheduledAt: input.scheduledAt,
                    materialUrl: input.materialUrl,
                    channels: {
                        create: input.platforms.map(platform => ({
                            platform,
                            customPlatform:
                                platform === "OTHER"
                                    ? input.customPlatform
                                    : null,
                        })),
                    },
                },
                select: { id: true },
            });

            return {
                id: content.id,
                alreadySaved: false,
            };
        });
    } finally {
        await prisma.$disconnect();
    }
}