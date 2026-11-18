import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import type { createPrismaClient } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push/web-push";
import { planAllows, planStateFrom } from "@/lib/subscription/plan-state";
import type { StoredAiMessage } from "./ai-conversations-client";
import { buildWeeklyDigest } from "./weekly-digest";

type Client = ReturnType<typeof createPrismaClient>;

export const WEEKLY_DIGEST_TITLE = "კვირის მიმოხილვა";

// კვირის დასაწყისი (ორშაბათი) თბილისის დროით, მაგ. "2026-11-16".
export function digestWeek(now: Date) {
    const local = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const weekday = (local.getUTCDay() + 6) % 7;
    return new Date(local.getTime() - weekday * 86_400_000).toISOString().slice(0, 10);
}

// ერთი მფლობელი, ერთი ბიზნესი, ერთი კვირა — ერთი ჩათის id. ხელახალი გაშვება ახალს ვეღარ ქმნის.
function digestConversationId(businessId: string, userId: string, week: string) {
    const hex = createHash("sha256").update(`ai-weekly-digest:${businessId}:${userId}:${week}`).digest("hex");
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function plainLine(text: string) {
    // პუშში ჯერ გაყიდვების ციფრი, თუ ფინანსები ჩანს; თორემ პირველი პუნქტი.
    const rows = text.split("\n").filter((row) => row.startsWith("• "));
    const line = rows.find((row) => row.startsWith("• გაყიდვები:")) ?? rows[0] ?? "";
    const clean = line.replace(/^• /, "").replace(/\*\*/g, "").trim();
    return clean.length > 150 ? `${clean.slice(0, 147)}…` : clean;
}

/**
 * კვირის მიმოხილვა სერვერზე, კვირაში ერთხელ (ორშაბათს დილით, worker.mjs-ის cron-იდან):
 * AI-ის გეგმის მქონე ყველა ბიზნესის თითო აქტიურ მფლობელს ერთი ჩათი და ერთი პუში.
 * მოწყობილობების რაოდენობა აღარ მოქმედებს: id კვირაზეა მიბმული, ამიტომ დუბლიკატი არ იქმნება.
 */
export async function deliverWeeklyDigests(prisma: Client, now = new Date()) {
    const week = digestWeek(now);
    const businesses = await prisma.business.findMany({
        where: { memberships: { some: { role: "OWNER", status: "ACTIVE", user: { status: "ACTIVE" } } } },
        select: {
            id: true, name: true, mode: true,
            subscription: { select: { plan: true, status: true, expiresAt: true } },
            memberships: { where: { role: "OWNER", status: "ACTIVE", user: { status: "ACTIVE" } }, select: { userId: true } },
        },
    });

    let created = 0;
    for (const business of businesses) {
        const plan = planStateFrom(business.subscription
            ? { plan: business.subscription.plan, status: business.subscription.status, expiresAt: business.subscription.expiresAt }
            : null, now);
        if (!planAllows(plan, "ai")) continue;

        const owners = business.memberships.map((member) => ({
            userId: member.userId,
            id: digestConversationId(business.id, member.userId, week),
        }));
        const existing = new Set((await prisma.aiConversation.findMany({
            where: { id: { in: owners.map((owner) => owner.id) } }, select: { id: true },
        })).map((row) => row.id));
        const missing = owners.filter((owner) => !existing.has(owner.id));
        if (missing.length === 0) continue;

        try {
            const digest = await buildWeeklyDigest(prisma, business.id, now, hasBusinessFeature(business.mode, "imports"));
            if (!digest) continue;

            for (const owner of missing) {
                const message: StoredAiMessage = {
                    id: owner.id,
                    role: "assistant",
                    text: digest.text,
                    ...(digest.cards.length ? { cards: digest.cards } : {}),
                };
                const inserted = await prisma.aiConversation.createMany({
                    data: [{
                        id: owner.id, businessId: business.id, userId: owner.userId, title: WEEKLY_DIGEST_TITLE,
                        messages: [message] as unknown as Prisma.InputJsonValue,
                    }],
                    skipDuplicates: true,
                });
                if (inserted.count === 0) continue;
                created += 1;
                await sendPushToUsers(prisma, [owner.userId], {
                    title: `${WEEKLY_DIGEST_TITLE} · ${business.name}`,
                    body: plainLine(digest.text) || "მართეო AI-მ ამ კვირის მიმოხილვა მოამზადა.",
                    url: `/dashboard?ai=${owner.id}`,
                    tag: `ai-digest-${business.id}`,
                    businessId: business.id,
                }).catch(() => console.error("AI digest push failed"));
            }
        } catch (error) {
            // ერთი ბიზნესის შეცდომა დანარჩენებს არ აჩერებს.
            console.error("AI weekly digest failed", error instanceof Error ? error.name : "UnknownError");
        }
    }
    return created;
}
