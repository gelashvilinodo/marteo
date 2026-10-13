import { mutateContent } from "@/lib/content/mutate-content";
import { contentBody } from "@/lib/content/validate-content";
import {
    readOrderBody,
    orderJson,
    orderError,
} from "@/lib/orders/order-http";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";

type Context = {
    params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
    try {
        const body = contentBody(await readOrderBody(request));
        const { id } = await context.params;

        if (body.action !== "edit" && body.action !== "platform") {
            return orderJson(
                { success: false, message: "მოქმედება არასწორია." },
                422,
            );
        }

        const content = await mutateContent(id, body.action, body);
        return orderJson({ success: true, content });
    } catch (cause: unknown) {
        return orderError(cause);
    }
}

export async function DELETE(request: Request, context: Context) {
    try {
        const body = await readOrderBody(request);
        const { id } = await context.params;
        const content = await mutateContent(id, "delete", body);

        return orderJson({ success: true, content });
    } catch (cause: unknown) {
        return orderError(cause);
    }
}

export async function GET(_request: Request, context: Context) {
    try {
        if (!(await getCurrentUser())) {
            return orderJson(
                { success: false, message: "გაიარე ავტორიზაცია." },
                401,
            );
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return orderJson(
                { success: false, message: "ბიზნესი ვერ მოიძებნა." },
                403,
            );
        }

        const { id } = await context.params;
        const prisma = createPrismaClient();

        try {
            const content = await prisma.contentItem.findFirst({
                where: {
                    id,
                    businessId: membership.businessId,
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    materialUrl: true,
                    type: true,
                    customType: true,
                    status: true,
                    scheduledAt: true,
                    updatedAt: true,
                    channels: {
                        orderBy: { platform: "asc" },
                        select: {
                            id: true,
                            platform: true,
                            customPlatform: true,
                            completedAt: true,
                        },
                    },
                },
            });

            if (!content) {
                return orderJson(
                    {
                        success: false,
                        message: "კონტენტი ვერ მოიძებნა.",
                    },
                    404,
                );
            }

            return orderJson({
                success: true,
                content: {
                    ...content,
                    scheduledAt:
                        content.scheduledAt?.toISOString() ?? null,
                    updatedAt: content.updatedAt.toISOString(),
                    channels: content.channels.map(channel => ({
                        ...channel,
                        completedAt:
                            channel.completedAt?.toISOString() ?? null,
                    })),
                },
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return orderError(cause);
    }
}