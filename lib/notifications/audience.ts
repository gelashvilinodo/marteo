import { Prisma } from "@/generated/prisma/client";

export { PLAN_AUDIENCES, PLAN_LABELS, describeAudience, type Audience, type PlanAudience } from "./audience-options";

// A paying subscriber has a non-free plan in ACTIVE status; trials count as not bought yet.
export const PAID_SUBSCRIPTION = Prisma.sql`(s.plan IS NOT NULL AND s.plan <> 'FREE' AND s.status = 'ACTIVE')`;

/**
 * Matches user alias `u` against an audience. Arguments are SQL expressions so the
 * same rule serves both campaign columns (delivery) and form values (preview count).
 * Users who registered after deliverAt never receive older broadcasts.
 */
export function audienceMatch(a: { modes: Prisma.Sql; plan: Prisma.Sql; days: Prisma.Sql; deliverAt: Prisma.Sql }) {
    return Prisma.sql`
        u."createdAt" <= ${a.deliverAt}
        AND (${a.days} IS NULL OR u."createdAt" >= ${a.deliverAt} - make_interval(days => ${a.days}))
        AND EXISTS (
            SELECT 1 FROM "BusinessMembership" am
            JOIN "Business" b ON b.id = am."businessId"
            LEFT JOIN "Subscription" s ON s."businessId" = b.id
            WHERE am."userId" = u.id
              AND (coalesce(cardinality(${a.modes}), 0) = 0 OR b.mode = ANY(${a.modes}))
              AND (${a.plan} = 'ALL' OR (${a.plan} = 'PAID') = ${PAID_SUBSCRIPTION})
        )`;
}
