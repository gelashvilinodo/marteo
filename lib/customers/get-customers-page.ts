import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveCustomersPeriod } from "./customers-period";

export type CustomersSearchParams = Record<
    string,
    string | string[] | undefined
>;

export type CustomersFilter =
    | "all"
    | "new"
    | "repeat"
    | "top";

export type CustomersSort =
    | "name-asc"
    | "name-desc"
    | "date-desc"
    | "date-asc"
    | "orders-desc"
    | "last-order-desc";

type CustomerRow = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string;
    address: string | null;
    createdAt: Date;
    completedOrders: number;
    lastOrderAt: Date | null;
};

type Summary = {
    total: number;
    newCustomers: number;
    repeatCustomers: number;
    topCustomer: {
        id: string;
        firstName: string | null;
        phone: string;
        completedOrders: number;
    } | null;
};

const PAGE_SIZE = 20;

export async function getCustomersPage(
    prisma: ReturnType<typeof createPrismaClient>,
    businessId: string,
    params: CustomersSearchParams,
) {
    const text = (key: string) =>
        typeof params[key] === "string"
            ? params[key].trim()
            : "";

    const range = resolveCustomersPeriod(
        text("period"),
        text("from"),
        text("to"),
    );

    const filters: CustomersFilter[] = [
        "all",
        "new",
        "repeat",
        "top",
    ];

    const filter = filters.includes(
        text("filter") as CustomersFilter,
    )
        ? text("filter") as CustomersFilter
        : "all";

    const ordering: Record<CustomersSort, Prisma.Sql> = {
        "name-asc": Prisma.sql`
            NULLIF("firstName", '') ASC NULLS LAST,
            "id" ASC
        `,
        "name-desc": Prisma.sql`
            NULLIF("firstName", '') DESC NULLS LAST,
            "id" ASC
        `,
        "date-desc": Prisma.sql`
            "createdAt" DESC, "id" ASC
        `,
        "date-asc": Prisma.sql`
            "createdAt" ASC, "id" ASC
        `,
        "orders-desc": Prisma.sql`
            "completedOrders" DESC, "id" ASC
        `,
        "last-order-desc": Prisma.sql`
            "lastOrderAt" DESC NULLS LAST, "id" ASC
        `,
    };

    const sort = Object.hasOwn(ordering, text("sort"))
        ? text("sort") as CustomersSort
        : "name-asc";

    const query = text("q");
    const rawPage = Number(text("page"));

    const requestedPage =
        Number.isSafeInteger(rawPage) && rawPage > 0
            ? rawPage
            : 1;

    const orderPeriod = range.start && range.end
        ? Prisma.sql`
            AND o."createdAt" >= ${range.start}
            AND o."createdAt" < ${range.end}
        `
        : Prisma.empty;

    const newPeriod = range.start && range.end
        ? Prisma.sql`
            "createdAt" >= ${range.start}
            AND "createdAt" < ${range.end}
        `
        : Prisma.sql`TRUE`;

    const base = Prisma.sql`
        WITH order_stats AS (
            SELECT
                o."customerId",
                COUNT(*)::int AS "completedOrders",
                MAX(o."createdAt") AS "lastOrderAt"
            FROM "Order" o
            WHERE o."businessId" = ${businessId}
                AND o."status" = 'COMPLETED'
                ${orderPeriod}
            GROUP BY o."customerId"
        ),
        customers AS (
            SELECT
                c."id",
                c."firstName",
                c."lastName",
                c."phone",
                c."address",
                c."createdAt",
                COALESCE(
                    s."completedOrders", 0
                )::int AS "completedOrders",
                s."lastOrderAt"
            FROM "Customer" c
            LEFT JOIN order_stats s
                ON s."customerId" = c."id"
            WHERE c."businessId" = ${businessId}
                AND c."deletedAt" IS NULL
        )
    `;

    return prisma.$transaction(async tx => {
        const [summary] = await tx.$queryRaw<Summary[]>(
            Prisma.sql`
                ${base}
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (
                        WHERE ${newPeriod}
                    )::int AS "newCustomers",
                    COUNT(*) FILTER (
                        WHERE "completedOrders" >= 2
                    )::int AS "repeatCustomers",
                    (
                        SELECT json_build_object(
                            'id', "id",
                            'firstName', "firstName",
                            'phone', "phone",
                            'completedOrders', "completedOrders"
                        )
                        FROM customers
                        WHERE "completedOrders" > 0
                        ORDER BY
                            "completedOrders" DESC,
                            "id" ASC
                        LIMIT 1
                    ) AS "topCustomer"
                FROM customers
            `,
        );

        const filterWhere =
            filter === "new"
                ? newPeriod
                : filter === "repeat"
                    ? Prisma.sql`"completedOrders" >= 2`
                    : filter === "top"
                        ? summary.topCustomer
                            ? Prisma.sql`
                                "id" = ${summary.topCustomer.id}
                            `
                            : Prisma.sql`FALSE`
                        : Prisma.sql`TRUE`;

        const pattern =
            `%${query.replace(/[\\%_]/g, "\\$&")}%`;

        const digits = query.replace(/\D/g, "");

        const phoneSearch = digits
            ? Prisma.sql`
                OR regexp_replace(
                    "phone", '[^0-9]', '', 'g'
                ) LIKE ${`%${digits}%`}
            `
            : Prisma.empty;

        const searchWhere = query
            ? Prisma.sql`(
                concat_ws(
                    ' ', "firstName", "lastName"
                ) ILIKE ${pattern}
                OR "phone" ILIKE ${pattern}
                OR "address" ILIKE ${pattern}
                ${phoneSearch}
            )`
            : Prisma.sql`TRUE`;

        const where = Prisma.sql`
            ${filterWhere} AND ${searchWhere}
        `;

        const [count] = await tx.$queryRaw<
            Array<{ total: number }>
        >(Prisma.sql`
            ${base}
            SELECT COUNT(*)::int AS total
            FROM customers
            WHERE ${where}
        `);

        const totalPages = Math.max(
            1,
            Math.ceil(count.total / PAGE_SIZE),
        );

        const currentPage = Math.min(
            requestedPage,
            totalPages,
        );

        const rows = await tx.$queryRaw<CustomerRow[]>(
            Prisma.sql`
                ${base}
                SELECT *
                FROM customers
                WHERE ${where}
                ORDER BY ${ordering[sort]}
                LIMIT ${PAGE_SIZE}
                OFFSET ${(currentPage - 1) * PAGE_SIZE}
            `,
        );

        return {
            customers: rows.map(customer => ({
                ...customer,
                createdAt: customer.createdAt.toISOString(),
                lastOrderAt:
                    customer.lastOrderAt?.toISOString() ?? null,
            })),
            summary,
            filter,
            sort,
            query,
            period: range.period,
            from: range.from,
            to: range.to,
            periodError: range.error,
            totalCount: count.total,
            currentPage,
            totalPages,
            pageSize: PAGE_SIZE,
        };
    }, {
        isolationLevel:
            Prisma.TransactionIsolationLevel.RepeatableRead,
    });
}

export type CustomersPageData = Awaited<
    ReturnType<typeof getCustomersPage>
>;

export type CustomerEntry =
    CustomersPageData["customers"][number];