import "server-only";

import type { createPrismaClient } from "@/lib/prisma";
import { mergeCardGroups, type AiCardGroup } from "./ai-cards";
import { getBusinessInsights } from "./business-insights";

type Client = ReturnType<typeof createPrismaClient>;

function money(cents: number) {
    return `${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₾`;
}

function count(value: number, word: string) {
    return `**${value} ${word}**`;
}

// კვირის მიმოხილვა მოდელის გარეშე იწერება: ტექსტიც და ციფრებიც კოდიდანაა,
// ამიტომ ყოველ ჯერზე ერთნაირი და უფასოა.
export async function buildWeeklyDigest(prisma: Client, businessId: string, now: Date, purchasePlan: boolean) {
    const insights = await getBusinessInsights(prisma, businessId, now);
    const lines: string[] = [];
    const cards: AiCardGroup[] = [];

    const restock = insights.restock.filter((row) => row.planned === null);
    if (restock.length > 0) {
        const rows = restock.slice(0, 3);
        lines.push(`${count(restock.length, "პროდუქტი")} მალე ამოიწურება${purchasePlan ? " — ქვემოთ შეგიძლია პირდაპირ შესაძენ სიაში დაამატო" : ""}.`);
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
        lines.push(`${count(insights.idle.length, "პროდუქტი")} 60+ დღეა არ იყიდება${insights.idleValueCents > 0 ? `, მათში გაჩერებულია **${money(insights.idleValueCents)}**` : ""}. იფიქრე ფასდაკლებაზე ან რეკლამაზე.`);
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
        lines.push(`**${top.item.name}** ხშირად ბრუნდება (${top.ratePercent}%, ძირითადად: ${top.topReason}) — გადახედე აღწერას ან ზომებს.`);
    }

    if (insights.margins.length > 0 && lines.length < 5) {
        lines.push(`${count(insights.margins.length, "პროდუქტს")} 20%-ზე დაბალი მარჟა აქვს — შეამოწმე ფასები.`);
    }

    const [bestDay] = insights.timing.weekdays;
    const [bestHours] = insights.timing.bestHours;
    if (insights.timing.orders >= 20 && bestDay && bestHours && lines.length < 5) {
        lines.push(`ყველაზე მეტი შეკვეთა მოდის **${bestDay.day}ს**, საათებიდან კი **${bestHours.hours}** — კარგი დროა პოსტისთვის.`);
    }

    if (lines.length === 0) return null;

    return {
        text: `კვირის მიმოხილვა — შენი მონაცემებით:\n\n${lines.slice(0, 5).map((line) => `• ${line}`).join("\n")}\n\nდეტალებისთვის მკითხე, მაგალითად: „რა შევიძინო შემდეგ პარტიაში?“`,
        cards: mergeCardGroups(cards),
    };
}
