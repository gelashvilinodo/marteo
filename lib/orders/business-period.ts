import "server-only";

import { resolveOrdersPeriod } from "./orders-period";

type Reader = {
    $queryRaw<T = unknown>(
        query: TemplateStringsArray,
        ...values: unknown[]
    ): PromiseLike<T>;
};

// ბიზნესის პირველი დღე თბილისის დროით: რეგისტრაცია, ან უფრო ძველი
// (მაგ. იმპორტირებული) შეკვეთის თარიღი.
export async function getBusinessSince(reader: Reader, businessId: string) {
    const [row] = await reader.$queryRaw<{ since: string | null }[]>`
        SELECT to_char(
            LEAST(
                b."createdAt",
                (SELECT MIN(o."createdAt") FROM "Order" o WHERE o."businessId" = b.id)
            ) + INTERVAL '4 hours',
            'YYYY-MM-DD'
        ) AS since
        FROM "Business" b
        WHERE b.id = ${businessId}
    `;

    return row?.since ?? undefined;
}

// resolveOrdersPeriod, რომელიც "all"-ის დროს ბიზნესის დაწყების დღეს თავად პოულობს.
export async function resolveBusinessPeriod(
    reader: Reader,
    businessId: string,
    period: string,
    from: string,
    to: string,
) {
    const since =
        period === "all"
            ? await getBusinessSince(reader, businessId)
            : undefined;

    return resolveOrdersPeriod(period, from, to, new Date(), since);
}
