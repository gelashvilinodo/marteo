import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { ADMIN_PAGE_SIZE } from "./lists";
import { createPrismaClient } from "@/lib/prisma";

export type EmailLogRow = { id: string; kind: string; recipient: string; status: string; providerId: string | null; error: string | null; createdAt: string };

const view = (row: { id: string; kind: string; recipient: string; status: string; providerId: string | null; error: string | null; createdAt: Date }): EmailLogRow =>
    ({ ...row, createdAt: row.createdAt.toISOString() });

/** The last e-mails to one address (user page). */
export async function emailsFor(prisma: PrismaClient, email: string, take = 15) {
    const rows = await prisma.emailLog.findMany({ where: { recipient: email.trim().toLowerCase() }, orderBy: { createdAt: "desc" }, take });
    return rows.map(view);
}

export async function emailStats(prisma: PrismaClient, now = new Date()) {
    const groups = await prisma.emailLog.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } }, _count: { _all: true } });
    const count = (status: string) => groups.find(group => group.status === status)?._count._all ?? 0;
    return { sent: count("SENT"), failed: count("FAILED"), limited: count("LIMITED") };
}

export type EmailFilters = { q: string; status: "" | "SENT" | "FAILED" | "LIMITED"; kind: string };

const KINDS = ["verification", "password-reset", "email-change", "team-invite", "admin-invite", "notice"];

export function parseEmailFilters(params: Record<string, string | string[] | undefined>): EmailFilters {
    const one = (key: string) => { const value = params[key]; return ((Array.isArray(value) ? value[0] : value) ?? "").trim(); };
    const status = one("status");
    const kind = one("kind");
    return {
        q: one("q").toLowerCase().slice(0, 100),
        status: status === "SENT" || status === "FAILED" || status === "LIMITED" ? status : "",
        kind: KINDS.includes(kind) ? kind : "",
    };
}

export async function getEmailLog(page: number, filters: EmailFilters) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const prisma = createPrismaClient();
    try {
        const where = {
            ...(filters.q ? { recipient: { contains: filters.q } } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.kind ? { kind: filters.kind } : {}),
        };
        const [total, rows, stats] = await Promise.all([
            prisma.emailLog.count({ where }),
            prisma.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE }),
            emailStats(prisma),
        ]);
        return { total, rows: rows.map(view), stats };
    } finally { await prisma.$disconnect(); }
}
