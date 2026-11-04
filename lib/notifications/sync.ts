import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { audienceMatch, PLAN_LABELS } from "./audience";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

export const LOW_STOCK_THRESHOLD = 5; // Same rule as the inventory page "დაბალი მარაგი" filter.
const STOCK_SUMMARY_AFTER = 3;
// საცდელზე 2 დღით ადრე, ფასიან გეგმაზე 3 დღით ადრე.
const TRIAL_REMINDER_DAYS = 2;
const RENEWAL_REMINDER_DAYS = 3;
const ENDED_NOTICE_DAYS = 14;
const TBILISI_DATE = (column: Prisma.Sql) => Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tbilisi', 'DD.MM.YYYY')`;

/**
 * Creates any notifications that became due for this user. There is no cron:
 * this runs when the user opens the dashboard, and every insert is idempotent
 * (dedupeKey / unique alert), so concurrent requests cannot duplicate rows.
 */
export async function syncNotifications(tx: Tx, userId: string, businessId: string | null, now = new Date()) {
    await deliverWelcome(tx, userId, now);
    await deliverCampaigns(tx, userId, now);
    if (!businessId) return;
    await deliverSubscriptionReminders(tx, businessId, now);
    await deliverStockAlerts(tx, businessId, now);
}

async function deliverWelcome(tx: Tx, userId: string, now: Date) {
    // Only users registered after the template was installed: existing users are not greeted retroactively.
    await tx.$executeRaw`
        INSERT INTO "Notification" (id, "userId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, u.id, 'WELCOME', t.title, t.body, t."actionLabel", t."actionUrl", 'welcome:' || u.id, ${now}, ${now}
        FROM "User" u JOIN "NotificationTemplate" t ON t.key = 'WELCOME'
        WHERE u.id = ${userId} AND u."createdAt" >= t."createdAt"
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
}

async function deliverCampaigns(tx: Tx, userId: string, now: Date) {
    const match = audienceMatch({
        modes: Prisma.sql`c.modes`, plan: Prisma.sql`c.plan::text`,
        days: Prisma.sql`c."registeredWithinDays"`, deliverAt: Prisma.sql`c."deliverAt"`,
    });
    await tx.$executeRaw`
        INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "campaignId", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, u.id, NULL, 'ANNOUNCEMENT', c.title, c.body, c."actionLabel", c."actionUrl", c.id,
            'campaign:' || c.id || ':' || u.id, c."deliverAt", ${now}
        FROM "NotificationCampaign" c JOIN "User" u ON u.id = ${userId}
        WHERE c."canceledAt" IS NULL AND c."deliverAt" <= ${now} AND ${match}
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
}

/**
 * გეგმის შეხსენებები მფლობელებს (აპში; მეილს და პუშს deliverNoticeChannels აგზავნის):
 * საცდელი სრულდება 2 დღეში, ფასიანი გეგმა იწურება 3 დღეში (გაუქმებულზე — „სრულდება“),
 * და ერთი შეტყობინება დასრულების შემდეგ. businessId = null — ყველა ბიზნესი (საათობრივი cron).
 * გასაღებში ვადის დრო წერია, ამიტომ განახლების შემდეგ ახალი პერიოდი თავიდან იწყება.
 */
export async function deliverSubscriptionReminders(tx: Tx, businessId: string | null, now = new Date()) {
    const date = TBILISI_DATE(Prisma.sql`s."expiresAt"`);
    const plan = Prisma.raw(`coalesce(${planLabelCase("s.plan::text")}, s.plan::text)`);
    const scope = businessId === null ? Prisma.sql`TRUE` : Prisma.sql`s."businessId" = ${businessId}`;
    const exp = Prisma.sql`to_char(s."expiresAt", 'YYYYMMDDHH24MISS')`;
    await tx.$executeRaw`
        INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, m."userId", s."businessId",
            CASE WHEN s.status = 'TRIALING' THEN 'TRIAL_ENDING'::"NotificationKind" ELSE 'RENEWAL_REMINDER'::"NotificationKind" END,
            CASE WHEN s.status = 'TRIALING' THEN 'საცდელი პერიოდი 2 დღეში სრულდება'
                WHEN s."cancelAtPeriodEnd" THEN 'გაუქმებული გეგმა მალე სრულდება'
                ELSE 'გეგმის ვადა მალე იწურება' END,
            CASE WHEN s.status = 'TRIALING'
                THEN 'საცდელი პერიოდი სრულდება ' || ${date} || '-ს. აირჩიე გეგმა, რომ მუშაობა უწყვეტად გააგრძელო. მონაცემები არ იკარგება.'
                WHEN s."cancelAtPeriodEnd"
                THEN 'შენი ' || ${plan} || ' გეგმა ' || ${date} || '-ს სრულდება. გადაფიქრება ვადამდე შეგიძლია „პაკეტი და გადახდებიდან“.'
                ELSE 'შენი ' || ${plan} || ' გეგმის ვადა ' || ${date} || '-ს იწურება. განაახლე, რომ მუშაობა არ შეფერხდეს.'
            END,
            CASE WHEN s.status = 'TRIALING' THEN 'გეგმის არჩევა' ELSE 'პაკეტი და გადახდები' END,
            CASE WHEN s.status = 'TRIALING' THEN '/dashboard/plans' ELSE '/dashboard/billing' END,
            CASE WHEN s.status = 'TRIALING' THEN 'trial-ending:' ELSE 'renewal:' END || s.id || ':' || ${exp} || ':' || m."userId",
            ${now}, ${now}
        FROM "Subscription" s JOIN "BusinessMembership" m ON m."businessId" = s."businessId"
            -- გადახდა მფლობელების საქმეა; თანამშრომელი სხვის გეგმაზე შეხსენებას არ იღებს.
            AND m.role = 'OWNER' AND m.status = 'ACTIVE'
        WHERE ${scope} AND s."expiresAt" > ${now}
          AND ((s.status = 'TRIALING' AND s."expiresAt" <= ${new Date(now.getTime() + TRIAL_REMINDER_DAYS * 86400000)})
            OR (s.status = 'ACTIVE' AND s.plan <> 'FREE' AND s."expiresAt" <= ${new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 86400000)}))
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
    // დასრულების შემდეგ: ერთი შეტყობინება, რომ ბიზნესი მხოლოდ ნახვის რეჟიმშია და მონაცემები შენახულია.
    // საათობრივი cron სტატუსს PAST_DUE / EXPIRED / CANCELED-ზე გადაიყვანს, ამიტომ ყველა „ახლახან დასრულებულად“ ითვლება.
    await tx.$executeRaw`
        INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, m."userId", s."businessId",
            CASE WHEN s.plan = 'FREE' THEN 'TRIAL_ENDING'::"NotificationKind" ELSE 'RENEWAL_REMINDER'::"NotificationKind" END,
            CASE WHEN s.plan = 'FREE' THEN 'საცდელი პერიოდი დასრულდა'
                WHEN s.status = 'CANCELED' OR s."cancelAtPeriodEnd" THEN 'გაუქმებული გეგმა დასრულდა'
                ELSE 'გეგმის ვადა ამოიწურა' END,
            CASE WHEN s.plan = 'FREE' THEN 'საცდელი პერიოდი დასრულდა ' || ${date} || '-ს.'
                ELSE 'შენი ' || ${plan} || ' გეგმა დასრულდა ' || ${date} || '-ს.' END
                || ' ბიზნესი ახლა მხოლოდ ნახვის რეჟიმშია, მონაცემები შენახულია. აირჩიე გეგმა, რომ დამატება და ცვლილება დაგიბრუნდეს.',
            'გეგმის არჩევა', '/dashboard/plans',
            'ended:' || s.id || ':' || ${exp} || ':' || m."userId",
            ${now}, ${now}
        FROM "Subscription" s JOIN "BusinessMembership" m ON m."businessId" = s."businessId"
            AND m.role = 'OWNER' AND m.status = 'ACTIVE'
        WHERE ${scope}
          AND s."expiresAt" <= ${now} AND s."expiresAt" > ${new Date(now.getTime() - ENDED_NOTICE_DAYS * 86400000)}
          AND (s.status IN ('ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED') AND s.plan <> 'FREE'
            OR s.status IN ('TRIALING', 'EXPIRED') AND s.plan = 'FREE')
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
}

function planLabelCase(column: string) {
    const cases = Object.entries(PLAN_LABELS).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ");
    return `CASE ${column} ${cases} END`;
}

type NewAlert = {
    alertId: string; level: "LOW" | "OUT"; inventoryItemId: string; good: number;
    name: string; color: string | null; size: string | null; imageUrl: string | null;
};

async function deliverStockAlerts(tx: Tx, businessId: string, now: Date) {
    // goodStock mirrors the inventory page: received lots only, minus defective units.
    // Data-modifying CTEs share one snapshot, so recovered alerts are cleared and new
    // episodes opened in a single statement; ON CONFLICT makes concurrent runs safe.
    const alerts = await tx.$queryRaw<NewAlert[]>`
        WITH balances AS (
            SELECT lot."inventoryItemId" AS id,
                SUM(lot."remainingQuantity") - SUM(lot."remainingDefectiveQuantity") AS good
            FROM "InventoryStockLot" lot
            JOIN "InventoryItem" i ON i.id = lot."inventoryItemId"
            LEFT JOIN "PurchaseItem" source ON source.id = lot."purchaseItemId"
            LEFT JOIN "Purchase" pu ON pu.id = source."purchaseId"
            WHERE i."businessId" = ${businessId} AND i."isActive" = TRUE
              AND (lot."purchaseItemId" IS NULL OR (pu."businessId" = ${businessId} AND pu."receiptStatus" = 'RECEIVED'))
            GROUP BY lot."inventoryItemId"
        ), levels AS (
            SELECT id, good, CASE WHEN good <= 0 THEN 'OUT' WHEN good < ${LOW_STOCK_THRESHOLD} THEN 'LOW' END AS level
            FROM balances
        ), cleared AS (
            DELETE FROM "InventoryStockAlert" a
            WHERE a."businessId" = ${businessId}
              AND NOT EXISTS (SELECT 1 FROM levels l WHERE l.id = a."inventoryItemId" AND l.level = a.level::text)
            RETURNING a.id
        ), opened AS (
            INSERT INTO "InventoryStockAlert" (id, "businessId", "inventoryItemId", level, "createdAt")
            SELECT gen_random_uuid()::text, ${businessId}, l.id, l.level::"StockAlertLevel", ${now}
            FROM levels l WHERE l.level IS NOT NULL
            ON CONFLICT ("inventoryItemId", level) DO NOTHING
            RETURNING id, "inventoryItemId", level
        )
        SELECT o.id AS "alertId", o.level::text AS level, o."inventoryItemId", greatest(l.good, 0)::int AS good,
            p.name, i.color, i.size, i."imageUrl"
        FROM opened o
        JOIN levels l ON l.id = o."inventoryItemId"
        JOIN "InventoryItem" i ON i.id = o."inventoryItemId"
        JOIN "Product" p ON p.id = i."productId"
        ORDER BY p.name, i.color NULLS LAST, i.size NULLS LAST
    `;
    if (!alerts.length) return;

    // მარაგის შეტყობინება მხოლოდ მათ, ვინც მარაგს ან შესყიდვებს ხედავს.
    const members = Prisma.sql`SELECT "userId" FROM "BusinessMembership" WHERE "businessId" = ${businessId} AND status = 'ACTIVE'
        AND (role IN ('OWNER', 'ADMIN') OR permissions && ARRAY['INVENTORY', 'PURCHASES']::"BusinessPermission"[])`;
    if (alerts.length > STOCK_SUMMARY_AFTER) {
        // Many alerts at once (e.g. the first check of a business): one summary, not a flood.
        const out = alerts.filter(a => a.level === "OUT").length;
        const low = alerts.length - out;
        const body = [low && `${low} პროდუქტის მარაგი იწურება`, out && `${out} პროდუქტი ამოიწურა`].filter(Boolean).join(", ") + ". გადახედე მარაგებს და დროულად შეავსე.";
        const key = `stock-summary:${alerts[0].alertId}`;
        await tx.$executeRaw`
            INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
            SELECT gen_random_uuid()::text, m."userId", ${businessId}, 'STOCK_SUMMARY', 'მარაგები ყურადღებას საჭიროებს', ${body},
                'მარაგების ნახვა', ${out && !low ? "/dashboard/inventory?status=exhausted" : "/dashboard/inventory?status=low"}, ${key} || ':' || m."userId", ${now}, ${now}
            FROM (${members}) m
            ON CONFLICT ("dedupeKey") DO NOTHING
        `;
        return;
    }
    for (const alert of alerts) {
        const variant = [alert.color, alert.size].filter(Boolean).join(" · ");
        const label = variant ? `${alert.name} (${variant})` : alert.name;
        const out = alert.level === "OUT";
        const title = out ? "პროდუქტი ამოიწურა" : "მარაგი იწურება";
        const body = out ? `${label} - მარაგი ამოიწურა. შეავსე, რომ შეკვეთები არ დაკარგო.` : `${label} - დარჩა მხოლოდ ${alert.good} ცალი.`;
        await tx.$executeRaw`
            INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "imageUrl", "inventoryItemId", "dedupeKey", "deliverAt", "createdAt")
            SELECT gen_random_uuid()::text, m."userId", ${businessId}, ${alert.level === "OUT" ? "OUT_OF_STOCK" : "LOW_STOCK"}::"NotificationKind",
                ${title}, ${body}, 'მარაგის ნახვა', ${`/dashboard/inventory?status=${out ? "exhausted" : "low"}`}, ${alert.imageUrl}, ${alert.inventoryItemId},
                ${`stock:${alert.alertId}:`} || m."userId", ${now}, ${now}
            FROM (${members}) m
            ON CONFLICT ("dedupeKey") DO NOTHING
        `;
    }
}

/**
 * Call from the payment provider's confirmation handler (inside its transaction)
 * once a subscription payment is captured. paymentId keeps retries idempotent.
 */
export async function notifyPaymentConfirmed(tx: Tx, input: { businessId: string; plan: string; paymentId: string; now?: Date }) {
    const now = input.now ?? new Date();
    const plan = PLAN_LABELS[input.plan] ?? input.plan;
    await tx.$executeRaw`
        INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
        SELECT gen_random_uuid()::text, m."userId", ${input.businessId}, 'PAYMENT_CONFIRMED', 'გადახდა დადასტურდა, მადლობა! 🎉',
            ${`${plan} გეგმა გააქტიურდა. მადლობა, რომ მართეოს ენდობი, წარმატებებს გისურვებთ!`},
            'მთავარზე გადასვლა', '/dashboard', ${`payment:${input.paymentId}:`} || m."userId", ${now}, ${now}
        FROM "BusinessMembership" m WHERE m."businessId" = ${input.businessId} AND m.role = 'OWNER' AND m.status = 'ACTIVE'
        ON CONFLICT ("dedupeKey") DO NOTHING
    `;
}
