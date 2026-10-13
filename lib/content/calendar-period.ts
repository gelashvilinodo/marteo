export type CalendarView = "month" | "week" | "day";

export type CalendarSearchParams = Record<
    string,
    string | string[] | undefined
>;

const DAY = 86400000;
const GEORGIA_OFFSET = 4 * 60 * 60 * 1000;

export function calendarToday(now = new Date()) {
    return new Date(now.getTime() + GEORGIA_OFFSET)
        .toISOString()
        .slice(0, 10);
}

export function validCalendarDate(value: string) {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value.startsWith("0000-")
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function utcDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
}

function dateText(date: Date) {
    return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, days: number) {
    return dateText(
        new Date(utcDate(value).getTime() + days * DAY),
    );
}

export function calendarDayStart(value: string) {
    return new Date(`${value}T00:00:00+04:00`);
}

export function resolveCalendarPeriod(
    params: CalendarSearchParams,
    now = new Date(),
) {
    const text = (key: string) =>
        typeof params[key] === "string" ? params[key].trim() : "";

    const requestedView = text("view");
    const view: CalendarView =
        requestedView === "week" || requestedView === "day"
            ? requestedView
            : "month";

    const today = calendarToday(now);
    const requestedDate = text("date");
    const anchor = validCalendarDate(requestedDate)
        ? requestedDate
        : today;

    const monthStart = `${anchor.slice(0, 7)}-01`;
    const nextMonth = utcDate(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEnd = addCalendarDays(dateText(nextMonth), -1);

    let from = anchor;
    let to = anchor;

    if (view === "week") {
        const weekday = (utcDate(anchor).getUTCDay() + 6) % 7;
        from = addCalendarDays(anchor, -weekday);
        to = addCalendarDays(from, 6);
    }

    if (view === "month") {
        const weekday = (utcDate(monthStart).getUTCDay() + 6) % 7;
        from = addCalendarDays(monthStart, -weekday);

        // ექვსი კვირა — თვის კალენდრის სიმაღლე სტაბილურია.
        to = addCalendarDays(from, 41);
    }

    const dayCount =
        Math.round(
            (utcDate(to).getTime() - utcDate(from).getTime()) / DAY,
        ) + 1;

    return {
        view,
        anchor,
        today,
        monthStart,
        monthEnd,
        from,
        to,
        start: calendarDayStart(from),
        end: calendarDayStart(addCalendarDays(to, 1)),
        days: Array.from(
            { length: dayCount },
            (_, index) => addCalendarDays(from, index),
        ),
    };
}

export function shiftCalendarPeriod(
    anchor: string,
    view: CalendarView,
    direction: -1 | 1,
) {
    if (view === "day") {
        return addCalendarDays(anchor, direction);
    }

    if (view === "week") {
        return addCalendarDays(anchor, direction * 7);
    }

    const date = utcDate(anchor);
    const originalDay = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + direction);

    const followingMonth = new Date(date);
    followingMonth.setUTCMonth(followingMonth.getUTCMonth() + 1);

    const lastDay = new Date(
        followingMonth.getTime() - DAY,
    ).getUTCDate();

    date.setUTCDate(Math.min(originalDay, lastDay));
    return dateText(date);
}