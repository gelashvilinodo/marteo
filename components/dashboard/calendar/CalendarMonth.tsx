"use client";

import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import {
    calendarLocalParts,
    calendarMonths,
    calendarWeekdays,
} from "@/lib/content/calendar-period";
import {
    contentCardStyle,
    contentPlatformColor,
} from "@/lib/content/content-card-style";
import { PlatformIcon, ContentTypeIcon } from "./ContentIcons";
import type { CalendarDrag } from "./calendar-drag";

// ზომები კლასებს ემთხვევა: კვირის დღეების ზოლი h-8 + border, უჯრის border + p-1.
// ჩანაწერები დღის რიცხვის გვერდით იწყება, ამიტომ უჯრის მთელ სიმაღლეს იყენებენ.
const WEEKDAY_ROW = 33;
const CELL_CHROME = 1 + 2 * 4;
const DOT_LIMIT = 3;

// ერთი ჩანაწერის სიმაღლე მომდევნო ჩანაწერამდე დაშორების ჩათვლით.
const ITEM_HEIGHT = { pill: 20, card: 52 } as const;

type Variant = "dots" | "pill" | "card";

// უჯრის სიგანე და არა ეკრანის breakpoint, რადგან sidebar-ი და AI პანელი
// ერთსა და იმავე ეკრანზეც სხვადასხვა სიგანეს ტოვებენ.
function variantFor(cellWidth: number): Variant {
    if (cellWidth < 72) return "dots";
    if (cellWidth < 150) return "pill";
    return "card";
}

function dateLabel(value: string) {
    const [year, month, day] = value.split("-");
    return `${Number(day)} ${calendarMonths[Number(month) - 1]} ${year}`;
}

export type CalendarBodySize = { width: number; height: number };

export default function CalendarMonth({
    data,
    grouped,
    size,
    compact,
    selected,
    busy,
    drag,
    onDay,
    onContent,
}: {
    data: CalendarPageData;
    grouped: Map<string, CalendarContent[]>;
    size: CalendarBodySize | null;
    // ტელეფონზე დღეზე დაჭერა დღეს მონიშნავს და მის სიას ბადის ქვეშ აჩვენებს.
    compact: boolean;
    selected: string;
    busy: boolean;
    drag: CalendarDrag;
    onDay: (date: string) => void;
    onContent: (content: CalendarContent) => void;
}) {
    const cellWidth = size ? size.width / 7 : 0;
    const rowHeight = size ? (size.height - WEEKDAY_ROW) / 6 : 0;
    const widthVariant = compact ? "dots" : variantFor(cellWidth);

    function fits(variant: "pill" | "card") {
        return Math.max(
            0,
            Math.floor(
                (rowHeight - CELL_CHROME + (variant === "pill" ? 2 : 4)) /
                ITEM_HEIGHT[variant],
            ),
        );
    }

    const pillCapacity = fits("pill");
    const cardCapacity = fits("card");

    // ფართო უჯრაში ბარათები მხოლოდ მაშინ, თუ ყველა ეტევა; თუ არა, ზოლებად მეტი ჩანს.
    function layoutFor(count: number): { variant: Variant; capacity: number } {
        if (widthVariant === "dots") return { variant: "dots", capacity: DOT_LIMIT };
        if (widthVariant === "card" && count <= cardCapacity) {
            return { variant: "card", capacity: cardCapacity };
        }
        return { variant: "pill", capacity: pillCapacity };
    }

    return (
        <>
            <div className="grid shrink-0 grid-cols-7 border-b border-border">
                {calendarWeekdays.map(day => (
                    <div
                        key={day}
                        className="flex h-8 items-center justify-center text-[10px] text-text-secondary sm:text-xs"
                    >
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 max-sm:flex-none max-sm:grid-rows-[repeat(6,3.25rem)]">
                {data.days.map(day => {
                    const items = grouped.get(day) ?? [];
                    const { variant, capacity } = layoutFor(items.length);
                    const outsideMonth =
                        day.slice(0, 7) !== data.anchor.slice(0, 7);

                    // ზომის გაზომვამდე ჩანაწერები არ ჩანს, რომ ჯერ არასწორი ვარიანტი არ გამოჩნდეს.
                    const visible = size || compact ? items.slice(0, capacity) : [];
                    const hidden = size || compact ? items.length - visible.length : 0;
                    const picked = compact && day === selected;
                    const dropping = drag.item !== null && drag.target?.day === day;

                    const dayNumber = (
                        <span
                            className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${day === data.today
                                ? "bg-accent font-semibold text-white"
                                : picked
                                    ? "font-semibold text-accent ring-1 ring-accent"
                                    : outsideMonth
                                        ? "text-text-secondary/50"
                                        : "text-text-primary"
                                }`}
                        >
                            {Number(day.slice(8, 10))}
                        </span>
                    );

                    return (
                        <div
                            key={day}
                            onDragOver={event => drag.over({ day, minutes: null }, event)}
                            onDrop={event => drag.drop({ day, minutes: null }, event)}
                            className={`relative min-h-0 min-w-0 overflow-hidden border-b border-r border-border p-1 ${dropping
                                ? "bg-accent/10 outline-2 -outline-offset-2 outline-dashed outline-accent"
                                : picked
                                    ? "bg-accent/10"
                                    : outsideMonth
                                        ? "bg-background/40"
                                        : ""
                                }`}
                        >
                            {/* მთელი უჯრა დღის გეგმას ხსნის: ტელეფონზე თითისთვის დიდი სამიზნეა. */}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onDay(day)}
                                aria-label={`${dateLabel(day)}: ${items.length} კონტენტი`}
                                aria-pressed={compact ? picked : undefined}
                                className="absolute inset-0 transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:bg-transparent"
                            />

                            {variant === "dots" ? (
                                <div className="pointer-events-none relative flex flex-col items-center gap-1">
                                    {dayNumber}

                                    {visible.length > 0 && (
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                            {visible.map(item => (
                                                <span
                                                    key={item.id}
                                                    style={{
                                                        backgroundColor: contentPlatformColor(
                                                            item.channels[0]?.platform,
                                                        ),
                                                    }}
                                                    className={`h-1.5 w-1.5 rounded-full ${item.status === "CANCELED" ? "opacity-40" : ""
                                                        }`}
                                                />
                                            ))}

                                            {hidden > 0 && (
                                                <span className="text-[9px] leading-none text-text-secondary">
                                                    +{hidden}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="pointer-events-none relative flex min-w-0 gap-1">
                                    <div className="flex w-6 shrink-0 flex-col items-center gap-0.5">
                                        {dayNumber}

                                        {hidden > 0 && (
                                            <span className="text-[10px] font-medium leading-4 tabular-nums text-accent">
                                                +{hidden}
                                            </span>
                                        )}
                                    </div>

                                    {visible.length > 0 && (
                                        <div
                                            className={`min-w-0 flex-1 ${variant === "pill" ? "space-y-0.5" : "space-y-1"
                                                }`}
                                        >
                                            {visible.map(item => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    disabled={busy}
                                                    draggable={drag.canMove(item)}
                                                    onDragStart={event => drag.start(item, event)}
                                                    onDragEnd={drag.end}
                                                    onClick={() => onContent(item)}
                                                    title={`${item.scheduledAt ? `${calendarLocalParts(item.scheduledAt).time} · ` : ""}${item.title}`}
                                                    style={contentCardStyle(item, data.today)}
                                                    className={`pointer-events-auto block w-full min-w-0 overflow-hidden border border-border text-left hover:border-accent disabled:opacity-50 ${variant === "pill"
                                                        ? "h-[18px] rounded px-1"
                                                        : "h-12 rounded-lg p-1.5"
                                                        } ${item.status === "CANCELED" || drag.item?.id === item.id ? "opacity-50" : ""} ${drag.canMove(item) ? "cursor-grab active:cursor-grabbing" : ""}`}
                                                >
                                                    {variant === "pill" ? (
                                                        <span className="flex min-w-0 items-center gap-1 text-[10px] leading-4 text-text-primary">
                                                            {cellWidth >= 140 && item.scheduledAt && (
                                                                <span className="shrink-0 tabular-nums text-text-secondary">
                                                                    {calendarLocalParts(item.scheduledAt).time}
                                                                </span>
                                                            )}
                                                            <span className="truncate">{item.title}</span>
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-text-primary">
                                                                <ContentTypeIcon type={item.type} />
                                                                <span className="truncate">{item.title}</span>
                                                            </span>

                                                            <span className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                                                                {item.scheduledAt && (
                                                                    <span className="shrink-0 text-[10px] tabular-nums text-text-secondary">
                                                                        {calendarLocalParts(item.scheduledAt).time}
                                                                    </span>
                                                                )}

                                                                {item.channels.map(channel => (
                                                                    <PlatformIcon
                                                                        key={channel.id}
                                                                        platform={channel.platform}
                                                                        customPlatform={channel.customPlatform}
                                                                        className="h-3.5 w-3.5"
                                                                    />
                                                                ))}
                                                            </span>
                                                        </>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
