import "server-only";

import type { createPrismaClient } from "@/lib/prisma";
import { mergeCardGroups, type AiCardGroup } from "./ai-cards";
import { getBusinessInsights } from "./business-insights";
import { getContentInsights } from "./content-insights";
import { getAnalyticsPage } from "@/lib/analytics/get-analytics-page";

type Client = ReturnType<typeof createPrismaClient>;

function money(cents: number) {
    return `${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₾`;
}

function count(value: number, word: string) {
    return `**${value} ${word}**`;
}

const DAY = 86_400_000;
const TBILISI = 4 * 3_600_000;

// "YYYY-MM-DD" თბილისის დღის დასაწყისი, UTC-ში.
function dayStart(date: string) {
    return new Date(Date.parse(`${date}T00:00:00Z`) - TBILISI);
}

function shiftDay(date: string, days: number) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

const SHORT_DATE = new Intl.DateTimeFormat("ka-GE", { day: "numeric", month: "short", timeZone: "UTC" });

type WeekFinance = { orders: number; sales: number; expenses: number; profit: number; profitReady: boolean };

// ერთი კვირის (ორშაბათი-კვირა, თბილისის დროით) ციფრები ანალიტიკის გვერდის ფორმულით,
// რომ მიმოხილვაში და ანალიტიკაში ერთი და იგივე ციფრი ეწეროს.
async function weekFinance(prisma: Client, businessId: string, monday: string): Promise<WeekFinance> {
    const sunday = shiftDay(monday, 6);
    const [page, orders] = await Promise.all([
        getAnalyticsPage(prisma, businessId, { period: "custom", from: monday, to: sunday }),
        prisma.order.count({ where: { businessId, status: { not: "CANCELED" }, createdAt: { gte: dayStart(monday), lt: dayStart(shiftDay(monday, 7)) } } }),
    ]);
    return {
        orders,
        sales: Number(page.sales),
        expenses: Number(page.costOfGoods) + Number(page.recordedExpenses),
        profit: Number(page.profit ?? page.partialProfit),
        profitReady: page.profitReady,
    };
}

// ცვლილება წინა კვირასთან: ▲/▼ და პროცენტი. წინა კვირა ნულზე იყო, ან ნიშანი შეიცვალა: პროცენტი უაზროა.
function change(current: number, previous: number) {
    if (Math.abs(current - previous) < 0.005) return "უცვლელი";
    const arrow = current > previous ? "▲" : "▼";
    if (previous <= 0 || current < 0) return arrow;
    const percent = Math.abs(Math.round(((current - previous) / previous) * 100));
    return percent === 0 ? `${arrow} 1%-ზე ნაკლები` : `${arrow} ${percent}%`;
}

function financeBlock(current: WeekFinance, previous: WeekFinance, monday: string) {
    if (current.orders === 0 && previous.orders === 0 && current.sales === 0 && previous.sales === 0) return null;
    const period = `${SHORT_DATE.format(new Date(`${monday}T00:00:00Z`))} – ${SHORT_DATE.format(new Date(`${shiftDay(monday, 6)}T00:00:00Z`))}`;
    const cash = (value: number) => money(Math.round(value * 100));
    const row = (label: string, now: number, before: number, format: (value: number) => string) =>
        `• ${label}: **${format(now)}** (${change(now, before)}, წინა კვირა ${format(before)})`;
    const rows = [
        row("ახალი შეკვეთები", current.orders, previous.orders, String),
        row("გაყიდვები", current.sales, previous.sales, cash),
        row("ხარჯები", current.expenses, previous.expenses, cash),
        row(current.profitReady ? "მოგება" : "მოგება (წინასწარი)", current.profit, previous.profit, cash),
    ];
    const note = current.profitReady ? "" : "\nზოგ შეკვეთას თვითღირებულება აკლია, ამიტომ მოგება ჯერ საბოლოო არ არის.";
    return `**გასული კვირა ციფრებში** (${period}), წინა კვირასთან შედარებით:\n${rows.join("\n")}${note}`;
}

// კვირის მიმოხილვა მოდელის გარეშე იწერება: ტექსტიც და ციფრებიც კოდიდანაა,
// ამიტომ ყოველ ჯერზე ერთნაირი და უფასოა.
export async function buildWeeklyDigest(prisma: Client, businessId: string, now: Date, purchasePlan: boolean) {
    // გასული კვირა: ამ ორშაბათამდე 7 დღე. წინა კვირა: მის წინ 7 დღე.
    const local = new Date(now.getTime() + TBILISI);
    const thisMonday = shiftDay(local.toISOString().slice(0, 10), -((local.getUTCDay() + 6) % 7));
    const lastMonday = shiftDay(thisMonday, -7);
    const [current, previous] = await Promise.all([
        weekFinance(prisma, businessId, lastMonday),
        weekFinance(prisma, businessId, shiftDay(lastMonday, -7)),
    ]);
    const finance = financeBlock(current, previous, lastMonday);

    const insights = await getBusinessInsights(prisma, businessId, now);
    const content = await getContentInsights(prisma, businessId, now, insights.timing);
    const lines: string[] = [];
    const cards: AiCardGroup[] = [];

    const restock = insights.restock.filter((row) => row.planned === null);
    if (restock.length > 0) {
        const rows = restock.slice(0, 3);
        lines.push(`${count(restock.length, "პროდუქტი")} მალე ამოიწურება${purchasePlan ? " — ქვემოთ შეგიძლიათ პირდაპირ შესაძენ სიაში დაამატოთ" : ""}.`);
        cards.push({
            kind: "stock",
            total: rows.length,
            items: rows.map((row) => row.item),
            notes: Object.fromEntries(rows.map((row) => [row.item.id, row.note])),
            restock: purchasePlan ? Object.fromEntries(rows.map((row) => [row.item.id, { quantity: row.suggested, reason: row.note }])) : undefined,
        });
    }

    if (insights.idle.length > 0) {
        const rows = insights.idle.slice(0, 3);
        lines.push(`${count(insights.idle.length, "პროდუქტი")} 60+ დღეა არ იყიდება${insights.idleValueCents > 0 ? `, მათში გაჩერებულია **${money(insights.idleValueCents)}**` : ""}. იფიქრეთ ფასდაკლებაზე ან რეკლამაზე.`);
        cards.push({
            kind: "stock",
            total: rows.length,
            items: rows.map((row) => row.item),
            notes: Object.fromEntries(rows.map((row) => [row.item.id, row.note])),
        });
    }

    const stuck = insights.orders.filter((row) => row.kind === "stuck_shipped").length;
    const unpaid = insights.orders.length - stuck;
    if (insights.orders.length > 0) {
        const parts = [
            stuck > 0 ? `${count(stuck, "შეკვეთა")} 7+ დღეა გაგზავნილია და არ დასრულებულა` : "",
            unpaid > 0 ? `${count(unpaid, "დასრულებული შეკვეთა")} სრულად არ არის გადახდილი` : "",
        ].filter(Boolean);
        lines.push(`${parts.join(", ")}.`);
        const rows = insights.orders.slice(0, 3);
        cards.push({
            kind: "orders",
            total: rows.length,
            items: rows.map((row) => row.order),
            notes: Object.fromEntries(rows.map((row) => [row.order.id, row.note])),
        });
    }

    if (insights.customers.length > 0) {
        const rows = insights.customers.slice(0, 3);
        lines.push(`${count(insights.customers.length, "მუდმივი მომხმარებელი")} 60+ დღეა აღარ ყიდულობს — ღირს მათთვის მიწერა.`);
        cards.push({
            kind: "customers",
            total: rows.length,
            items: rows.map((row) => row.customer),
            notes: Object.fromEntries(rows.map((row) => [row.customer.id, row.note])),
        });
    }

    if (insights.returns.length > 0) {
        const top = insights.returns[0];
        lines.push(`**${top.item.name}** ხშირად ბრუნდება (${top.ratePercent}%, ძირითადად: ${top.topReason}) — გადახედეთ აღწერას ან ზომებს.`);
    }

    if (insights.margins.length > 0 && lines.length < 5) {
        lines.push(`${count(insights.margins.length, "პროდუქტს")} 20%-ზე დაბალი მარჟა აქვს — შეამოწმეთ ფასები.`);
    }

    // კალენდარი: ვადაგადაცილებული პოსტები და პიკის დღეები პოსტის გარეშე.
    if (content.overdue.length > 0) {
        const rows = content.overdue.slice(0, 3);
        lines.push(`${count(content.overdue.length, "პოსტი")} ვადაგადაცილებულია კონტენტ-კალენდარში — გამოაქვეყნეთ ან გადაიტანეთ.`);
        cards.push({
            kind: "content",
            total: rows.length,
            items: rows.map((row) => row.card),
            notes: Object.fromEntries(rows.map((row) => [row.card.id, row.note])),
        });
    }

    if (content.uncoveredPeakDays.length > 0 && lines.length < 5) {
        const days = content.uncoveredPeakDays.map((day) => `**${day.weekday}ს**`).join(" და ");
        lines.push(`${days} ყველაზე მეტი შეკვეთა მოდის, ამ კვირაში კი ამ დღეს პოსტი არ გაქვთ დაგეგმილი.`);
    } else if (content.nothingPlanned && lines.length < 5) {
        lines.push("მომდევნო 7 დღეში კონტენტ-კალენდარში არაფერი გაქვთ დაგეგმილი.");
    }

    const [bestDay] = insights.timing.weekdays;
    const [bestHours] = insights.timing.bestHours;
    if (insights.timing.orders >= 20 && bestDay && bestHours && lines.length < 5 && content.uncoveredPeakDays.length === 0) {
        lines.push(`ყველაზე მეტი შეკვეთა მოდის **${bestDay.day}ს**, საათებიდან კი **${bestHours.hours}** — კარგი დროა პოსტისთვის.`);
    }

    if (lines.length === 0 && !finance) return null;

    const sections = [
        finance,
        lines.length ? `**ყურადღება მიაქციეთ:**\n${lines.slice(0, 5).map((line) => `• ${line}`).join("\n")}` : null,
    ].filter(Boolean);
    return {
        text: `კვირის მიმოხილვა — თქვენი მონაცემებით:\n\n${sections.join("\n\n")}\n\nდეტალებისთვის მკითხეთ, მაგალითად: „რა შევიძინო შემდეგ პარტიაში?“`,
        cards: mergeCardGroups(cards),
    };
}
