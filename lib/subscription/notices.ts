import "server-only";
import { Resend } from "resend";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getAppOrigin, readServerSetting } from "@/lib/auth/send-password-reset-email";
import { createPrismaClient } from "@/lib/prisma";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";
import { escapeHtml } from "@/lib/security/html";

type Db = PrismaClient | Prisma.TransactionClient;

// გეგმასთან დაკავშირებული შეტყობინებები აპის გარდა მეილითა და პუშითაც იგზავნება.
// სათაური და ტექსტი ყველა არხზე ერთია; მეილს მხოლოდ მისალმება, ღილაკი და ხელმოწერა ემატება.
export const CHANNEL_KINDS = ["TRIAL_ENDING", "RENEWAL_REMINDER", "PAYMENT_CONFIRMED", "PAYMENT_FAILED", "PLAN_CHANGED", "LIMIT_WARNING", "SMS_LOW"] as const;
export type NoticeKind = typeof CHANNEL_KINDS[number];

export type OwnerNotice = {
    businessId: string;
    kind: NoticeKind;
    // იდემპოტენტურობა: ერთი მოვლენა ერთ მფლობელს ერთხელ.
    key: string;
    title: string;
    body: string;
    actionLabel?: string;
    actionUrl?: string;
};

// შეტყობინება ბიზნესის ყველა აქტიურ მფლობელს (თანამშრომელი გეგმის შეტყობინებებს არ იღებს).
// აბრუნებს შექმნილი ჩანაწერების რაოდენობას (0 — უკვე იყო).
export async function notifyOwners(db: Db, notice: OwnerNotice, now = new Date()) {
    return db.$executeRaw`
        INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, m."userId", ${notice.businessId}, ${notice.kind}::"NotificationKind", ${notice.title}, ${notice.body},
            ${notice.actionLabel ?? "პაკეტი და გადახდები"}, ${notice.actionUrl ?? "/dashboard/billing"}, ${`${notice.key}:`} || m."userId", ${now}, ${now}
        FROM "BusinessMembership" m WHERE m."businessId" = ${notice.businessId} AND m.role = 'OWNER' AND m.status = 'ACTIVE'
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
}

// სატესტო და დაცული მისამართები მეილს არ იღებენ.
const RESERVED_EMAIL = /@(?:[^@]+\.)?(?:invalid|test|example|localhost)$|@example\.(?:com|org|net)$/i;

function emailHtml(name: string | null, title: string, body: string, actionLabel: string, url: string) {
    return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0F1C2E;">
    <h2 style="margin: 0 0 16px;">${escapeHtml(name ? `გამარჯობა, ${name}!` : "გამარჯობა!")}</h2>
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">${escapeHtml(title)}</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${escapeHtml(body)}</p>
    <a href="${escapeHtml(url)}" style="display: inline-block; background: #5a8dee; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 600;">${escapeHtml(actionLabel)}</a>
    <p style="font-size: 15px; line-height: 1.6; margin: 32px 0 0;">პატივისცემით,<br>მართეოს გუნდი</p>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
    const apiKey = readServerSetting("RESEND_API_KEY");
    const from = readServerSetting("RESEND_FROM_EMAIL");
    if (!apiKey || !from || RESERVED_EMAIL.test(to)) return false;
    const { error } = await new Resend(apiKey).emails.send({ from, to: [to], subject: `${subject} · MARTEO`, html });
    if (error) throw new Error("Notice email failed");
    return true;
}

/**
 * აგზავნის მეილს და პუშს ჯერ გაუგზავნელ გეგმის შეტყობინებებზე (ბოლო 3 დღის), შემდეგ ნიშნავს.
 * ჯერ ნიშნავს, მერე აგზავნის: ერთდროული გაშვება ერთსა და იმავეს ორჯერ ვერ გაგზავნის.
 */
export async function deliverNoticeChannels(prisma: PrismaClient, businessId?: string, now = new Date()) {
    const claimed = await prisma.$queryRaw<{ id: string; userId: string; title: string; body: string; actionLabel: string | null; actionUrl: string | null }[]>`
        UPDATE "Notification" n SET "channelsSentAt" = ${now}
        WHERE n.id IN (
            SELECT id FROM "Notification"
            WHERE "channelsSentAt" IS NULL AND "deletedAt" IS NULL AND "deliverAt" <= ${now}
              AND "createdAt" > ${new Date(now.getTime() - 3 * 86_400_000)}
              AND kind::text = ANY(${[...CHANNEL_KINDS]})
              ${businessId ? Prisma.sql`AND "businessId" = ${businessId}` : Prisma.empty}
            ORDER BY "createdAt" LIMIT 200 FOR UPDATE SKIP LOCKED
        )
        RETURNING n.id, n."userId", n.title, n.body, n."actionLabel", n."actionUrl"
    `;
    if (!claimed.length) return 0;
    const users = new Map((await prisma.user.findMany({
        where: { id: { in: [...new Set(claimed.map(row => row.userId))] } },
        select: { id: true, email: true, firstName: true },
    })).map(user => [user.id, user]));
    let origin = "";
    try { origin = getAppOrigin(); } catch { /* without APP_URL the e-mail button points to the site root */ }
    for (const row of claimed) {
        const path = row.actionUrl ?? "/dashboard/billing";
        await sendPushToUsers(prisma, [row.userId], { title: row.title, body: row.body, url: path, tag: "billing" })
            .catch(() => console.error("Notice push failed"));
        const user = users.get(row.userId);
        if (user) {
            await sendEmail(user.email, row.title, emailHtml(user.firstName, row.title, row.body, row.actionLabel ?? "გახსნა", `${origin}${path}`))
                .catch(() => console.error("Notice email failed"));
        }
    }
    return claimed.length;
}

// მოვლენის შემდეგ (გადახდა, გეგმის შეცვლა, ლიმიტი) არხები მაშინვე იგზავნება; ჩავარდნილს cron აგზავნის.
export function queueNoticeChannels(businessId: string) {
    const prisma = createPrismaClient();
    return runInBackground(deliverNoticeChannels(prisma, businessId).finally(() => prisma.$disconnect()));
}

// ბანკის ეტაპისთვის: ჩამოჭრა ვერ შესრულდა (ნებისმიერი მიზეზით). ბიზნესი მხოლოდ ნახვის რეჟიმში გადადის.
export function notifyPaymentFailed(db: Db, input: { businessId: string; attemptId: string; plan: string }) {
    return notifyOwners(db, {
        businessId: input.businessId, kind: "PAYMENT_FAILED", key: `payment-failed:${input.attemptId}`,
        title: "გადახდა ვერ შესრულდა",
        body: `სამწუხაროდ, ${input.plan} გეგმის გადახდა ვერ შესრულდა, ამიტომ ბიზნესი დროებით მხოლოდ ნახვის რეჟიმშია. თქვენი მონაცემები შენახულია: სცადეთ ხელახლა ან შეცვალეთ ბარათი და ყველაფერი მაშინვე აღდგება.`,
        actionLabel: "ხელახლა გადახდა", actionUrl: "/dashboard/billing",
    });
}

// ლიმიტის 80% და 100%: თითო ზღვარზე ერთხელ თითო პერიოდში. true — ახლა შეიქმნა.
export async function notifyLimit(db: Db, input: { businessId: string; what: "orders" | "ai" | "aiFiles"; used: number; limit: number | null; periodStart: Date }) {
    if (!input.limit || input.limit <= 0) return false;
    const share = input.used / input.limit;
    if (share < 0.8) return false;
    const full = share >= 1;
    const label = { orders: "შეკვეთების", ai: "მართეო AI-ის", aiFiles: "ფაილიდან შესყიდვის" }[input.what];
    const stops = { orders: "ახალი შეკვეთების დამატება", ai: "მართეო AI-სთან მიმოწერა", aiFiles: "ფაილიდან შესყიდვის შექმნა" }[input.what];
    const created = await notifyOwners(db, {
        businessId: input.businessId, kind: "LIMIT_WARNING",
        key: `limit:${input.what}:${input.businessId}:${input.periodStart.toISOString()}:${full ? 100 : 80}`,
        title: full ? `${label} ლიმიტი ამოიწურა` : `${label} ლიმიტი იწურება`,
        body: full
            ? `ამ პერიოდის ${label} ლიმიტი (${input.limit}) სრულად გამოიყენეთ. ${stops} ახალი პერიოდის დაწყებისთანავე განახლდება, ან შეგიძლიათ ახლავე გადახვიდეთ უფრო დიდ გეგმაზე.`
            : `ამ პერიოდში უკვე გამოყენებულია ${input.used} / ${input.limit}. ლიმიტის ამოწურვის შემდეგ ${stops} დროებით შეჩერდება, ამიტომ თუ მეტი გჭირდებათ, დროულად გადახედეთ გეგმებს.`,
        actionLabel: "გეგმების ნახვა", actionUrl: "/dashboard/plans",
    });
    return created > 0;
}
