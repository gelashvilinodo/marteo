import "server-only";

import type { createPrismaClient } from "@/lib/prisma";
import type { AiContentCard } from "./ai-cards";
import type { Timing } from "./business-insights";
import { CONTENT_SELECT, contentCard, shift, stateOf, tbilisiDate, type ContentRow } from "./content-calendar-tool";

type Client = ReturnType<typeof createPrismaClient>;

const DAY = 86_400_000;
const WEEKDAYS = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"];
// პიკის დღეებზე რჩევა მხოლოდ საკმარისი შეკვეთების შემდეგ (როგორც დროის ანალიზში).
const MIN_ORDERS_FOR_PEAKS = 20;
const LOOKAHEAD_DAYS = 7;
const RECENT_DAYS = 60;

export type ContentInsights = {
    // unused — კალენდარი ბოლო 60 დღეში არ გამოუყენებია, ამიტომ არც ვაწუხებთ.
    status: "unused" | "ok";
    overdue: Array<{ card: AiContentCard; days: number; pending: string[]; note: string }>;
    upcoming: number;
    peakWeekdays: string[];
    uncoveredPeakDays: Array<{ date: string; weekday: string }>;
    nothingPlanned: boolean;
};

function weekday(date: string) {
    return WEEKDAYS[(new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7];
}

export async function getContentInsights(prisma: Client, businessId: string, now: Date, timing: Timing): Promise<ContentInsights> {
    const today = tbilisiDate(now.getTime());
    const todayStart = new Date(`${today}T00:00:00+04:00`);
    const horizon = new Date(todayStart.getTime() + LOOKAHEAD_DAYS * DAY);
    const recent = new Date(todayStart.getTime() - RECENT_DAYS * DAY);

    const [overdueRows, upcomingRows, recentCount] = await Promise.all([
        prisma.contentItem.findMany({
            where: {
                businessId,
                status: { notIn: ["CANCELED", "PUBLISHED"] },
                scheduledAt: { lt: todayStart },
                channels: { some: { completedAt: null } },
            },
            orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
            take: 30,
            select: CONTENT_SELECT,
        }) as Promise<ContentRow[]>,
        prisma.contentItem.findMany({
            where: { businessId, status: { not: "CANCELED" }, scheduledAt: { gte: todayStart, lt: horizon } },
            select: { scheduledAt: true },
        }),
        prisma.contentItem.count({ where: { businessId, scheduledAt: { gte: recent } } }),
    ]);

    const overdue = overdueRows.map((row) => {
        const card = contentCard(row, stateOf(row, today));
        const days = row.scheduledAt ? Math.max(1, Math.floor((todayStart.getTime() - row.scheduledAt.getTime()) / DAY) + 1) : 0;
        const pending = row.channels.filter((channel) => channel.completedAt === null).map((channel) => channel.customPlatform || channel.platform);
        return {
            card,
            days,
            pending,
            note: `${days} დღეა ვადაგადაცილებულია. შესასრულებელია: ${pending.join(", ")}. გამოაქვეყნეთ და მონიშნეთ, ან გადაიტანეთ სხვა დღეზე.`,
        };
    });

    // კვირის ყველაზე შეკვეთიანი დღეები, თუ მონაცემი საკმარისია და დღეები მართლა გამოირჩევა.
    const ranked = timing.weekdays.filter((day) => day.orders > 0);
    const average = timing.orders / 7;
    const peakWeekdays = timing.orders >= MIN_ORDERS_FOR_PEAKS
        ? ranked.slice(0, 2).filter((day) => day.orders > average).map((day) => day.day)
        : [];

    const busy = new Set(upcomingRows.flatMap((row) => row.scheduledAt ? [tbilisiDate(row.scheduledAt.getTime())] : []));
    const nextDays = Array.from({ length: LOOKAHEAD_DAYS }, (_, index) => shift(today, index));
    const uncoveredPeakDays = nextDays
        .filter((date) => peakWeekdays.includes(weekday(date)) && !busy.has(date))
        .map((date) => ({ date, weekday: weekday(date) }));

    return {
        status: recentCount === 0 && overdue.length === 0 ? "unused" : "ok",
        overdue,
        upcoming: upcomingRows.length,
        peakWeekdays,
        uncoveredPeakDays,
        nothingPlanned: recentCount > 0 && upcomingRows.length === 0,
    };
}
