import "server-only";

import type { createPrismaClient } from "@/lib/prisma";
import { hasBusinessAccess } from "@/lib/business/permissions";
import { sendPushToUsers } from "@/lib/push/web-push";
import { planStateFrom } from "@/lib/subscription/plan-state";

type Client = ReturnType<typeof createPrismaClient>;

export const STALE_ORDER_DAYS = 7;
const statusLabels: Record<string, string> = { PROCESSING: "მუშავდება", SHIPPED: "გაგზავნილი" };

type Claimed = { id: string; businessId: string; number: number | null; status: string };

/**
 * დღეში ერთხელ (worker.mjs): შეკვეთა, რომელიც 7+ დღის წინ შეიქმნა და ჯერ „მუშავდება“ ან „გაგზავნილია“,
 * ბიზნესის მფლობელს და შეკვეთების უფლების მქონე თანამშრომლებს ერთი შეჯამებული პუშით ეგზავნება.
 * თითო შეკვეთა მხოლოდ ერთხელ: ჯერ staleNotifiedAt ინიშნება, მერე იგზავნება, ამიტომ განმეორებითი გაშვება დუბლიკატს ვერ გააგზავნის.
 * იმპორტირებული ისტორიული და წაშლის მოთხოვნის მქონე შეკვეთები, ასევე დაბლოკილი გეგმის ბიზნესები არ ითვლება.
 */
export async function deliverStaleOrderPushes(prisma: Client, now = new Date()) {
    const cutoff = new Date(now.getTime() - STALE_ORDER_DAYS * 86_400_000);
    const candidates = await prisma.$queryRaw<{ businessId: string }[]>`
        SELECT DISTINCT "businessId" FROM "Order"
        WHERE "staleNotifiedAt" IS NULL AND "deletedAt" IS NULL AND "deleteRequestedAt" IS NULL AND NOT "imported"
            AND status IN ('PROCESSING', 'SHIPPED') AND "createdAt" <= ${cutoff}
    `;
    if (!candidates.length) return 0;

    const businesses = await prisma.business.findMany({
        where: { id: { in: candidates.map(row => row.businessId) } },
        select: {
            id: true, name: true,
            subscription: { select: { plan: true, status: true, expiresAt: true } },
            memberships: {
                where: { status: "ACTIVE", user: { status: "ACTIVE" } },
                select: { userId: true, role: true, permissions: true, readOnly: true, status: true },
            },
        },
    });

    let sent = 0;
    for (const business of businesses) {
        // დაბლოკილ გეგმაზე შეკვეთები არ ინიშნება: გეგმის აღდგენის შემდეგ შეხსენება მაინც მოვა.
        if (planStateFrom(business.subscription, now).locked) continue;
        const userIds = business.memberships.filter(member => hasBusinessAccess(member, "ORDERS", "view")).map(member => member.userId);
        if (!userIds.length) continue;
        try {
            const orders = await prisma.$queryRaw<Claimed[]>`
                UPDATE "Order" SET "staleNotifiedAt" = ${now}
                WHERE id IN (
                    SELECT id FROM "Order"
                    WHERE "businessId" = ${business.id} AND "staleNotifiedAt" IS NULL AND "deletedAt" IS NULL
                        AND "deleteRequestedAt" IS NULL AND NOT "imported"
                        AND status IN ('PROCESSING', 'SHIPPED') AND "createdAt" <= ${cutoff}
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, "businessId", number, status::text AS status
            `;
            if (!orders.length) continue;
            await sendPushToUsers(prisma, userIds, staleOrdersMessage(business, orders))
                .catch(() => console.error("Stale order push failed"));
            sent += 1;
        } catch (error) {
            // ერთი ბიზნესის შეცდომა დანარჩენებს არ აჩერებს.
            console.error("Stale order push failed", error instanceof Error ? error.name : "UnknownError");
        }
    }
    return sent;
}

export function staleOrdersMessage(business: { id: string; name: string }, orders: Claimed[]) {
    const statuses = [...new Set(orders.map(order => order.status))];
    const single = orders.length === 1 ? orders[0] : null;
    const params = new URLSearchParams({ period: "all" });
    if (single?.number) params.set("q", String(single.number));
    else {
        params.set("sort", "date-asc");
        if (statuses.length === 1) params.set("status", statuses[0] === "SHIPPED" ? "shipped" : "processing");
    }
    const body = single
        ? `${single.number ? `შეკვეთა #${single.number}` : "შეკვეთა"} ${STALE_ORDER_DAYS} დღეზე მეტია „${statusLabels[single.status] ?? single.status}“ სტატუსშია. გთხოვთ, შეამოწმოთ და დაასრულოთ.`
        : `${orders.length} შეკვეთა ${STALE_ORDER_DAYS} დღეზე მეტია ჯერ არ დასრულებულა. გთხოვთ, შეამოწმოთ და დაასრულოთ.`;
    return {
        title: `დაუსრულებელი შეკვეთები · ${business.name}`,
        body,
        url: `/dashboard/orders?${params}`,
        tag: `stale-orders-${business.id}`,
        businessId: business.id,
    };
}
