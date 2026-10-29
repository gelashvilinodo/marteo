import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { syncNotifications } from "./sync";

export type UserNotification = {
    id: string; kind: string; title: string; body: string;
    actionLabel: string | null; actionUrl: string | null; imageUrl: string | null;
    deliverAt: Date; readAt: Date | null;
};

const LIST_LIMIT = 50;

// Notifications of other businesses the user belongs to stay hidden in this one.
const visible = (userId: string, businessId: string | null, now: Date) => Prisma.sql`
    n."userId" = ${userId} AND n."deliverAt" <= ${now} AND n."deletedAt" IS NULL
    AND (n."businessId" IS NULL OR n."businessId" = ${businessId})`;

async function withSync<T>(userId: string, businessId: string | null, read: (tx: Prisma.TransactionClient, now: Date) => Promise<T>) {
    const db = createPrismaClient();
    try {
        return await db.$transaction(async tx => {
            const now = new Date();
            await syncNotifications(tx, userId, businessId, now);
            return read(tx, now);
        }, { maxWait: 10000, timeout: 20000 });
    } finally { await db.$disconnect(); }
}

export function getUnreadNotificationCount(userId: string, businessId: string | null) {
    return withSync(userId, businessId, async (tx, now) => {
        const [row] = await tx.$queryRaw<{ unread: number }[]>`
            SELECT count(*)::int AS unread FROM "Notification" n WHERE ${visible(userId, businessId, now)} AND n."readAt" IS NULL
        `;
        return row?.unread ?? 0;
    });
}

/** Returns the latest notifications as they were before this visit, then marks them seen. */
export function openNotifications(userId: string, businessId: string | null) {
    return withSync(userId, businessId, async (tx, now) => {
        const rows = await tx.$queryRaw<UserNotification[]>`
            SELECT n.id, n.kind::text AS kind, n.title, n.body, n."actionLabel", n."actionUrl", n."imageUrl", n."deliverAt", n."readAt"
            FROM "Notification" n WHERE ${visible(userId, businessId, now)}
            ORDER BY n."deliverAt" DESC, n.id DESC LIMIT ${LIST_LIMIT}
        `;
        await tx.$executeRaw`UPDATE "Notification" n SET "readAt" = ${now} WHERE ${visible(userId, businessId, now)} AND n."readAt" IS NULL`;
        return rows;
    });
}

/**
 * Deletes one notification (or all, when id is null) that the user sees in the current business.
 * Rows are only hidden so their dedupeKey keeps sync from delivering them again.
 */
export async function deleteNotifications(userId: string, businessId: string | null, id: string | null) {
    const db = createPrismaClient();
    try {
        const now = new Date();
        await db.$executeRaw`
            UPDATE "Notification" n SET "deletedAt" = ${now}
            WHERE ${visible(userId, businessId, now)} ${id === null ? Prisma.empty : Prisma.sql`AND n.id = ${id}`}
        `;
    } finally { await db.$disconnect(); }
}
