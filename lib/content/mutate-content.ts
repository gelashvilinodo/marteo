import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "@/lib/orders/validate-order";
import {
    contentBody,
    contentPlatforms,
    contentVersion,
    validateContent,
    validateSchedule,
} from "./validate-content";

type Action = "edit" | "platform" | "all-platforms" | "schedule" | "delete";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export async function mutateContent(
    id: string,
    action: Action,
    raw: unknown,
) {
    if (!(await getCurrentUser())) fail("გაიარე ავტორიზაცია.", 401);

    const membership = await getCurrentBusiness();
    if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);

    const body = contentBody(raw);
    const expectedVersion = contentVersion(body.updatedAt);
    const input = action === "edit" ? validateContent(body) : null;
    const scheduledAt =
        action === "schedule" ? validateSchedule(body) : null;

    const platform =
        action === "platform"
            ? contentPlatforms.find(
                item => item.value === body.platform,
            )?.value
            : undefined;

    if (
        action === "platform" &&
        (!platform || typeof body.completed !== "boolean")
    ) {
        fail("მიუთითე პლატფორმა და შესრულების მდგომარეობა.");
    }

    if (action === "all-platforms" && typeof body.completed !== "boolean") {
        fail("მიუთითე შესრულების მდგომარეობა.");
    }

    const prisma = createPrismaClient();

    try {
        return await prisma.$transaction(async tx => {
            // მხოლოდ ამ კონტენტს ვკეტავთ, არა მთელ ბიზნესს: სხვა ჩანაწერების შენახვა არ ელოდება.
            await tx.$queryRaw`
                SELECT id
                FROM "ContentItem"
                WHERE id = ${id} AND "businessId" = ${membership.businessId}
                FOR UPDATE
            `;

            const existing = await tx.contentItem.findFirst({
                where: { id, businessId: membership.businessId },
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

            // პლატფორმის მონიშვნისას სრულ მონაცემს ვაბრუნებთ, რომ ფანჯარამ ხელახლა ჩატვირთვა არ დაელოდოს.
            const detail = (
                status: string,
                updatedAt: Date,
                completedAt: (channelId: string, value: Date | null) => Date | null,
            ) => ({
                ...existing!,
                status,
                scheduledAt: existing!.scheduledAt?.toISOString() ?? null,
                updatedAt: updatedAt.toISOString(),
                channels: existing!.channels.map(channel => ({
                    ...channel,
                    completedAt:
                        completedAt(channel.id, channel.completedAt)?.toISOString() ?? null,
                })),
            });

            if (!existing) {
                if (action === "delete") {
                    return { id, deleted: true };
                }

                fail("კონტენტი ვერ მოიძებნა.", 404);
            }

            if (action === "platform") {
                if (existing.status === "CANCELED") {
                    fail("გაუქმებულ კონტენტზე შესრულება ვერ მოინიშნება.");
                }

                const channel = existing.channels.find(
                    item => item.platform === platform,
                );

                if (!channel) {
                    fail("ეს პლატფორმა კონტენტს არ აქვს არჩეული.");
                }

                const alreadyMatches =
                    (channel.completedAt !== null) === body.completed;

                if (alreadyMatches) {
                    return detail(existing.status, existing.updatedAt, (_, value) => value);
                }
            }

            if (action === "all-platforms") {
                if (existing.status === "CANCELED") {
                    fail("გაუქმებულ კონტენტზე შესრულება ვერ მოინიშნება.");
                }

                const alreadyMatches = existing.channels.every(
                    channel => (channel.completedAt !== null) === body.completed,
                );

                if (alreadyMatches) {
                    return detail(existing.status, existing.updatedAt, (_, value) => value);
                }
            }

            if (
                scheduledAt &&
                existing.scheduledAt?.getTime() === scheduledAt.getTime()
            ) {
                return {
                    id,
                    updatedAt: existing.updatedAt.toISOString(),
                };
            }

            if (input) {
                const samePlatforms =
                    existing.channels.length === input.platforms.length &&
                    existing.channels.every(channel =>
                        input.platforms.some(
                            value => value === channel.platform,
                        ),
                    );

                const sameCustomPlatform =
                    (existing.channels.find(
                        channel => channel.platform === "OTHER",
                    )?.customPlatform ?? null) === input.customPlatform;

                const same =
                    existing.title === input.title &&
                    existing.description === input.description &&
                    existing.materialUrl === input.materialUrl &&
                    existing.type === input.type &&
                    existing.customType === input.customType &&
                    existing.scheduledAt?.getTime() ===
                    input.scheduledAt.getTime() &&
                    sameCustomPlatform &&
                    samePlatforms;

                if (same) {
                    return {
                        id,
                        updatedAt: existing.updatedAt.toISOString(),
                    };
                }
            }

            if (
                existing.updatedAt.getTime() !==
                expectedVersion.getTime()
            ) {
                fail(
                    "კონტენტი უკვე შეიცვალა. გახსენი ხელახლა და სცადე კიდევ ერთხელ.",
                    409,
                );
            }

            if (action === "delete") {
                await tx.contentItem.delete({
                    where: { id: existing.id },
                });

                return { id, deleted: true };
            }

            const updatedAt = new Date(
                Math.max(Date.now(), existing.updatedAt.getTime() + 1),
            );

            if (action === "platform") {
                const completed = body.completed === true;
                const channel = existing.channels.find(
                    item => item.platform === platform,
                )!;

                await tx.contentChannel.update({
                    where: { id: channel.id },
                    data: {
                        completedAt: completed ? updatedAt : null,
                    },
                });

                const allCompleted = existing.channels.every(item =>
                    item.id === channel.id
                        ? completed
                        : item.completedAt !== null,
                );

                const status = allCompleted ? "PUBLISHED" : "SCHEDULED";

                await tx.contentItem.update({
                    where: { id },
                    data: { status, updatedAt },
                });

                return detail(status, updatedAt, (channelId, value) =>
                    channelId === channel.id
                        ? completed ? updatedAt : null
                        : value,
                );
            }

            if (action === "all-platforms") {
                const completed = body.completed === true;
                // უკვე შესრულებულს თავისი დრო რჩება; იცვლება მხოლოდ დანარჩენი.
                const changing = existing.channels.filter(
                    channel => (channel.completedAt !== null) !== completed,
                );

                await tx.contentChannel.updateMany({
                    where: {
                        contentItemId: id,
                        id: { in: changing.map(channel => channel.id) },
                    },
                    data: { completedAt: completed ? updatedAt : null },
                });

                const status = completed ? "PUBLISHED" : "SCHEDULED";

                await tx.contentItem.update({
                    where: { id },
                    data: { status, updatedAt },
                });

                return detail(status, updatedAt, (channelId, value) =>
                    changing.some(channel => channel.id === channelId)
                        ? completed ? updatedAt : null
                        : value,
                );
            }

            // კალენდარში გადატანა მხოლოდ დროს ცვლის; სტატუსი და პლატფორმები იგივე რჩება.
            if (scheduledAt) {
                await tx.contentItem.update({
                    where: { id },
                    data: { scheduledAt, updatedAt },
                });

                return {
                    id,
                    updatedAt: updatedAt.toISOString(),
                };
            }

            if (!input) fail("მონაცემები ვერ დამუშავდა.");

            const existingOther = existing.channels.find(
                channel => channel.platform === "OTHER",
            );

            if (
                input.platforms.includes("OTHER") &&
                existingOther?.completedAt &&
                existingOther.customPlatform !== input.customPlatform
            ) {
                fail(
                    "შესრულებული პლატფორმის სახელის შესაცვლელად ჯერ მოხსენი შესრულების მონიშვნა.",
                );
            }

            const removed = existing.channels.filter(
                channel =>
                    !input.platforms.some(
                        value => value === channel.platform,
                    ),
            );

            if (removed.some(channel => channel.completedAt !== null)) {
                fail(
                    "შესრულებული პლატფორმის მოსაშორებლად ჯერ მოხსენი შესრულების მონიშვნა.",
                );
            }

            const added = input.platforms.filter(
                value =>
                    !existing.channels.some(
                        channel => channel.platform === value,
                    ),
            );

            if (removed.length > 0) {
                await tx.contentChannel.deleteMany({
                    where: {
                        contentItemId: id,
                        id: { in: removed.map(channel => channel.id) },
                    },
                });
            }

            if (added.length > 0) {
                await tx.contentChannel.createMany({
                    data: added.map(value => ({
                        contentItemId: id,
                        platform: value,
                        customPlatform:
                            value === "OTHER" ? input.customPlatform : null,
                    })),
                });
            }

            if (
                existingOther &&
                input.platforms.includes("OTHER") &&
                existingOther.customPlatform !== input.customPlatform
            ) {
                await tx.contentChannel.update({
                    where: { id: existingOther.id },
                    data: { customPlatform: input.customPlatform },
                });
            }

            const allCompleted =
                added.length === 0 &&
                input.platforms.every(value =>
                    existing.channels.some(
                        channel =>
                            channel.platform === value &&
                            channel.completedAt !== null,
                    ),
                );

            await tx.contentItem.update({
                where: { id },
                data: {
                    title: input.title,
                    description: input.description,
                    materialUrl: input.materialUrl,
                    type: input.type,
                    customType: input.customType,
                    scheduledAt: input.scheduledAt,
                    status:
                        existing.status === "CANCELED"
                            ? "CANCELED"
                            : allCompleted
                                ? "PUBLISHED"
                                : "SCHEDULED",
                    updatedAt,
                },
            });

            return {
                id,
                updatedAt: updatedAt.toISOString(),
            };
        });
    } finally {
        await prisma.$disconnect();
    }
}