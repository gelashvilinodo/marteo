import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { contentPlatforms, contentTypes } from "@/lib/content/content-options";
import { AI_CARD_LIMIT, type AiContentCard, type AiContentState } from "./ai-cards";
import type { AiToolContext } from "./marteo-ai-tools";

const DAY = 86_400_000;
const TBILISI_OFFSET = 4 * 60 * 60 * 1000;

// კალენდარი მომავალსაც მოიცავს, ამიტომ პერიოდები მთელ კვირასა და თვეს ფარავს.
const PERIODS = [
    "today",
    "tomorrow",
    "this_week",
    "next_week",
    "last_week",
    "this_month",
    "next_month",
    "last_month",
    "next_7_days",
    "next_30_days",
    "last_30_days",
    "custom",
] as const;

const STATES = ["planned", "published", "overdue", "canceled", "all"] as const;

export const CONTENT_CALENDAR_TOOL: Anthropic.Tool = {
    name: "get_content_calendar",
    description:
        "The business's content calendar (posts, reels, stories, videos, articles) for a period, including future dates. Each item has a date, type, platforms and a state: planned (upcoming), today, partly_done (done on some platforms), done (done on every platform), overdue (date passed but not done), canceled. Returns counts by state, platform and type, the items, and for periods up to 31 days the free_days with no content. state filters the items; query searches the title and text. The app shows the items to the user as cards with a details button.",
    input_schema: {
        type: "object",
        properties: {
            period: {
                type: "string",
                enum: PERIODS,
                description: "Tbilisi time. Weeks run Monday to Sunday and months cover the whole month, so they include future days. Use custom with from/to for any other range.",
            },
            from: { type: "string", description: "Start date YYYY-MM-DD, only for custom." },
            to: { type: "string", description: "End date YYYY-MM-DD (inclusive), only for custom." },
            state: { type: "string", enum: STATES, description: "planned = not done yet (including today and overdue)." },
            type: { type: "string", enum: contentTypes.map((item) => item.value) },
            platform: { type: "string", enum: [...contentPlatforms.map((item) => item.value), "LINKEDIN"] },
            query: { type: "string", description: "Part of the title or text." },
            limit: { type: "integer", minimum: 1, description: "How many items to return when the user asks for a specific number." },
        },
        required: ["period"],
    },
};

class CalendarInputError extends Error {}
export { CalendarInputError };

const STATE_LABELS: Record<AiContentState, string> = {
    planned: "დაგეგმილი",
    today: "დღეს",
    partly_done: "ნაწილობრივ შესრულებული",
    done: "შესრულებული",
    overdue: "ვადაგადაცილებული",
    canceled: "გაუქმებული",
};

export function tbilisiDate(time: number) {
    return new Date(time + TBILISI_OFFSET).toISOString().slice(0, 10);
}

export function shift(date: string, days: number) {
    return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10);
}

function isDate(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function monthEnd(date: string) {
    const [year, month] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function resolveRange(input: Record<string, unknown>, today: string) {
    const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const monday = shift(today, -weekday);
    const monthStart = `${today.slice(0, 7)}-01`;

    switch (input.period) {
        case "today": return { from: today, to: today };
        case "tomorrow": return { from: shift(today, 1), to: shift(today, 1) };
        case "this_week": return { from: monday, to: shift(monday, 6) };
        case "next_week": return { from: shift(monday, 7), to: shift(monday, 13) };
        case "last_week": return { from: shift(monday, -7), to: shift(monday, -1) };
        case "this_month": return { from: monthStart, to: monthEnd(monthStart) };
        case "next_month": {
            const start = shift(monthEnd(monthStart), 1);
            return { from: start, to: monthEnd(start) };
        }
        case "last_month": {
            const end = shift(monthStart, -1);
            return { from: `${end.slice(0, 7)}-01`, to: end };
        }
        case "next_7_days": return { from: today, to: shift(today, 6) };
        case "next_30_days": return { from: today, to: shift(today, 29) };
        case "last_30_days": return { from: shift(today, -29), to: today };
        case "custom":
            if (!isDate(input.from) || !isDate(input.to) || input.from > input.to) {
                throw new CalendarInputError("custom period needs valid from and to dates (YYYY-MM-DD, from <= to).");
            }
            if (Date.parse(input.to) - Date.parse(input.from) > 366 * DAY) {
                throw new CalendarInputError("custom period can be at most one year.");
            }
            return { from: input.from, to: input.to };
        default:
            throw new CalendarInputError(`Unknown period. Use one of: ${PERIODS.join(", ")}.`);
    }
}

export type ContentRow = {
    id: string;
    title: string;
    type: string;
    customType: string | null;
    status: string;
    scheduledAt: Date | null;
    channels: Array<{ platform: string; customPlatform: string | null; completedAt: Date | null }>;
};

// მდგომარეობა ისევე ითვლება, როგორც კალენდრის გვერდზე (contentCardStyle).
export function stateOf(row: ContentRow, today: string): AiContentState {
    if (row.status === "CANCELED") return "canceled";

    const done = row.channels.filter((channel) => channel.completedAt !== null).length;
    if (row.status === "PUBLISHED" || (row.channels.length > 0 && done === row.channels.length)) return "done";

    const day = row.scheduledAt ? tbilisiDate(row.scheduledAt.getTime()) : null;
    if (day !== null && day < today) return "overdue";
    if (done > 0) return "partly_done";
    return day === today ? "today" : "planned";
}

export const CONTENT_SELECT = {
    id: true,
    title: true,
    type: true,
    customType: true,
    status: true,
    scheduledAt: true,
    channels: { orderBy: { platform: "asc" as const }, select: { platform: true, customPlatform: true, completedAt: true } },
};

export function contentCard(row: ContentRow, state: AiContentState): AiContentCard {
    return {
        id: row.id,
        title: row.title,
        type: row.type,
        customType: row.customType,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        state,
        channels: row.channels.map((channel) => ({
            platform: channel.platform,
            customPlatform: channel.customPlatform,
            done: channel.completedAt !== null,
        })),
    };
}

function count<T extends string>(values: T[]) {
    return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}

export async function contentCalendarTool(context: AiToolContext, input: Record<string, unknown>) {
    const today = tbilisiDate(context.now.getTime());
    const range = resolveRange(input, today);
    const start = new Date(`${range.from}T00:00:00+04:00`);
    const end = new Date(Date.parse(`${range.to}T00:00:00+04:00`) + DAY);
    const query = typeof input.query === "string" ? input.query.trim().slice(0, 60) : "";
    const type = contentTypes.some((item) => item.value === input.type) ? String(input.type) : null;
    const platform = typeof input.platform === "string" && /^[A-Z]{2,12}$/.test(input.platform) ? input.platform : null;

    const rows: ContentRow[] = await context.prisma.contentItem.findMany({
        where: {
            businessId: context.businessId,
            scheduledAt: { gte: start, lt: end },
            ...(type ? { type: type as never } : {}),
            ...(platform ? { channels: { some: { platform: platform as never } } } : {}),
            ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}),
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: 500,
        select: CONTENT_SELECT,
    });

    const all = rows.map((row) => ({ row, state: stateOf(row, today) }));
    const wanted = typeof input.state === "string" && input.state !== "all" ? input.state : null;
    const matches = all.filter(({ state }) => wanted === null ||
        (wanted === "planned" ? ["planned", "today", "partly_done", "overdue"].includes(state) :
            wanted === "published" ? state === "done" : state === wanted));

    const limit = Number.isSafeInteger(input.limit) && Number(input.limit) >= 1 ? Math.min(Number(input.limit), AI_CARD_LIMIT) : AI_CARD_LIMIT;
    const shown = matches.slice(0, limit);

    const cards = shown.map(({ row, state }) => contentCard(row, state));
    if (cards.length > 0) {
        context.cards.push({ kind: "content", total: input.limit ? cards.length : matches.length, items: cards });
    }

    // ცარიელი დღეები: არაგაუქმებული კონტენტის გარეშე, მხოლოდ დღეიდან და თვეზე მოკლე პერიოდში.
    const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY) + 1;
    const busy = new Set(all.filter(({ state }) => state !== "canceled").flatMap(({ row }) =>
        row.scheduledAt ? [tbilisiDate(row.scheduledAt.getTime())] : []));
    const freeDays = days <= 31
        ? Array.from({ length: days }, (_, index) => shift(range.from, index)).filter((day) => day >= today && !busy.has(day))
        : undefined;

    const typeLabel = Object.fromEntries(contentTypes.map((item) => [item.value, item.label]));

    return {
        range,
        today,
        found: matches.length,
        by_state: count(all.map(({ state }) => STATE_LABELS[state])),
        by_platform: count(all.filter(({ state }) => state !== "canceled").flatMap(({ row }) => row.channels.map((channel) => channel.platform))),
        by_type: count(all.filter(({ state }) => state !== "canceled").map(({ row }) => typeLabel[row.type] ?? row.type)),
        items: shown.slice(0, 15).map(({ row, state }) => ({
            title: row.title,
            date: row.scheduledAt ? new Date(row.scheduledAt.getTime() + TBILISI_OFFSET).toISOString().slice(0, 16).replace("T", " ") : null,
            type: row.type === "OTHER" && row.customType ? row.customType : typeLabel[row.type] ?? row.type,
            platforms: row.channels.map((channel) => `${channel.customPlatform || channel.platform}${channel.completedAt ? " ✓" : ""}`),
            state: STATE_LABELS[state],
        })),
        ...(freeDays ? { free_days: freeDays } : {}),
    };
}
