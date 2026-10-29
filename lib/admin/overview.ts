import "server-only";
import { getAdminUser } from "./authorization";
import { createPgReader } from "@/lib/database/pg-reader";

export class AdminAccessError extends Error {}

export function getTbilisiDay(now = new Date()) {
    const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const start = new Date(`${date}T00:00:00+04:00`);
    return { date, start, end: new Date(start.getTime() + 86400000) };
}

export async function getAdminOverview() {
    // Check at the data boundary too: layout checks alone do not protect data.
    if (!await getAdminUser()) throw new AdminAccessError();
    const { date, start, end } = getTbilisiDay();
    const db = createPgReader();
    try {
        const [row] = await db.$queryRaw<{
            totalBusinesses: number; users: number; newBusinessesToday: number; orders: number; invoices: number; movements: number;
        }[]>`
            SELECT
                (SELECT count(*)::int FROM "Business") AS "totalBusinesses",
                (SELECT count(*)::int FROM "User") AS users,
                (SELECT count(*)::int FROM "Business" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}) AS "newBusinessesToday",
                (SELECT count(*)::int FROM "Order" WHERE "deletedAt" IS NULL) AS orders,
                (SELECT count(*)::int FROM "Order" WHERE "invoicePrintedAt" IS NOT NULL AND "deletedAt" IS NULL) AS invoices,
                (SELECT count(*)::int FROM "InventoryMovement") AS movements
        `;
        if (!row) throw new Error("Missing overview result");
        return { ...row, date, updatedAt: new Date().toISOString() };
    } finally { await db.$disconnect(); }
}
