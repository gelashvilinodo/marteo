import pg from 'pg';

// Runs from the Worker's hourly cron. Access already locks to read-only at the end date
// (readPlan); this only keeps the stored status honest for the admin panel and audiences:
// a paid plan past its date becomes PAST_DUE, and EXPIRED after a 7-day grace for renewal;
// an ended trial becomes EXPIRED at once (a trial is stored as plan FREE with status TRIALING). Each change is written to the admin audit log.
// Prisma DateTime columns are UTC "timestamp without time zone", hence the explicit UTC conversion.
/** @param {string} connectionString */
export async function expireSubscriptions(connectionString) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const result = await client.query(`
            WITH now_utc AS (SELECT now() AT TIME ZONE 'UTC' AS at),
            changed AS (
                UPDATE "Subscription" s
                SET status = (CASE WHEN o.status = 'ACTIVE' THEN 'PAST_DUE' ELSE 'EXPIRED' END)::"SubscriptionStatus",
                    "updatedAt" = (SELECT at FROM now_utc)
                FROM "Subscription" o
                WHERE o.id = s.id AND (o.plan <> 'FREE' OR o.status = 'TRIALING') AND o."canceledAt" IS NULL AND o."expiresAt" IS NOT NULL
                  AND ((o.status IN ('ACTIVE', 'TRIALING') AND o."expiresAt" <= (SELECT at FROM now_utc))
                    OR (o.status = 'PAST_DUE' AND o."expiresAt" <= (SELECT at FROM now_utc) - interval '7 days'))
                RETURNING s."businessId", s.plan, o.status AS "oldStatus", s.status, s."expiresAt"
            )
            INSERT INTO "AdminAuditLog" (id, "adminId", action, "targetType", "targetId", before, after, "createdAt")
            SELECT gen_random_uuid()::text, NULL, 'subscription-auto', 'BUSINESS', c."businessId",
                jsonb_build_object('plan', c.plan, 'status', c."oldStatus", 'expiresAt', to_char(c."expiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                jsonb_build_object('plan', c.plan, 'status', c.status, 'expiresAt', to_char(c."expiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                (SELECT at FROM now_utc)
            FROM changed c
        `);
        return result.rowCount ?? 0;
    } finally {
        await client.end();
    }
}
