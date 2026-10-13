import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import {
    addCalendarDays,
    calendarDayStart,
    resolveCalendarPeriod,
    type CalendarSearchParams,
} from "./calendar-period";

type CalendarCounts = {
    planned: string;
    published: string;
    overdue: string;
    today: string;
};

export async function getCalendarPage(
    prisma: Pick<
        ReturnType<typeof createPrismaClient>,
        "contentItem" | "$queryRaw"
    >,
    businessId: string,
    params: CalendarSearchParams,
    now = new Date(),
) {
    const period = resolveCalendarPeriod(params, now);
    const todayStart = calendarDayStart(period.today);
    const todayEnd = calendarDayStart(
        addCalendarDays(period.today, 1),
    );

    const monthStart = calendarDayStart(period.monthStart);
    const monthEnd = calendarDayStart(
        addCalendarDays(period.monthEnd, 1),
    );

    const rows = await prisma.contentItem.findMany({
        where: {
            businessId,
            OR: [
                {
                    scheduledAt: {
                        gte: period.start,
                        lt: period.end,
                    },
                },
                {
                    status: { notIn: ["CANCELED", "PUBLISHED"] },
                    scheduledAt: { lt: todayEnd },
                    channels: {
                        some: { completedAt: null },
                    },
                },
            ],
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            title: true,
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

    const [counts] = await prisma.$queryRaw<CalendarCounts[]>(Prisma.sql`
        WITH content AS (
            SELECT
                c.id,
                c.status,
                c."scheduledAt",
                BOOL_AND(ch."completedAt" IS NOT NULL)
                    AS all_completed,
                MAX(ch."completedAt") AS completed_at,
                BOOL_OR(ch."completedAt" IS NULL)
                    AS has_pending
            FROM "ContentItem" c
            LEFT JOIN "ContentChannel" ch
                ON ch."contentItemId" = c.id
            WHERE c."businessId" = ${businessId}
            GROUP BY c.id, c.status, c."scheduledAt"
        )
        SELECT
            COUNT(*) FILTER (
                WHERE status <> 'CANCELED'
                    AND "scheduledAt" >= ${monthStart}
                    AND "scheduledAt" < ${monthEnd}
            )::text AS planned,

            COUNT(*) FILTER (
                WHERE status <> 'CANCELED'
                    AND all_completed = TRUE
                    AND completed_at >= ${monthStart}
                    AND completed_at < ${monthEnd}
            )::text AS published,

            COUNT(*) FILTER (
                WHERE status NOT IN ('CANCELED', 'PUBLISHED')
                    AND has_pending = TRUE
                    AND "scheduledAt" < ${todayStart}
            )::text AS overdue,

            COUNT(*) FILTER (
                WHERE status NOT IN ('CANCELED', 'PUBLISHED')
                    AND has_pending = TRUE
                    AND "scheduledAt" >= ${todayStart}
                    AND "scheduledAt" < ${todayEnd}
            )::text AS today
        FROM content
    `);

    if (!counts) {
        throw new Error("კალენდრის მაჩვენებლები ვერ ჩაიტვირთა.");
    }

    function quantity(value: string) {
        const number = Number(value);

        if (!Number.isSafeInteger(number) || number < 0) {
            throw new Error("კალენდრის რაოდენობა ვერ დამუშავდა.");
        }

        return number;
    }

    function serialize(item: (typeof rows)[number]) {
        return {
            ...item,
            scheduledAt: item.scheduledAt?.toISOString() ?? null,
            updatedAt: item.updatedAt.toISOString(),
            channels: item.channels.map(channel => ({
                ...channel,
                completedAt:
                    channel.completedAt?.toISOString() ?? null,
            })),
        };
    }

    const calendarItems = rows
        .filter(
            item =>
                item.scheduledAt !== null &&
                item.scheduledAt >= period.start &&
                item.scheduledAt < period.end,
        )
        .map(serialize);

    const todayTasks = rows
        .filter(
            item =>
                item.status !== "CANCELED" &&
                item.status !== "PUBLISHED" &&
                item.scheduledAt !== null &&
                item.scheduledAt < todayEnd &&
                item.channels.some(
                    channel => channel.completedAt === null,
                ),
        )
        .map(item => ({
            ...serialize(item),
            overdue: item.scheduledAt! < todayStart,
        }));

    return {
        view: period.view,
        anchor: period.anchor,
        today: period.today,
        monthStart: period.monthStart,
        monthEnd: period.monthEnd,
        from: period.from,
        to: period.to,
        days: period.days,
        counts: {
            planned: quantity(counts.planned),
            published: quantity(counts.published),
            overdue: quantity(counts.overdue),
            today: quantity(counts.today),
        },
        calendarItems,
        todayTasks,
    };
}

export type CalendarPageData = Awaited<
    ReturnType<typeof getCalendarPage>
>;

export type CalendarContent = CalendarPageData["calendarItems"][number];