import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { PushMessage } from "@/lib/push/web-push";
import { sendAdminPush } from "./admin-push";

export const ADMIN_ALERTS_JOB = "admin-alerts";
const HOUR = 3_600_000;
// ბარათის გადახდა, რომელსაც ბანკი ამდენ ხანს არ პასუხობს (იგივე ზღვარი, რაც /admin/payments-ზე).
const STUCK_MS = 30 * 60_000;

export type AdminAlertSummary = {
    since: string;
    newErrors: { message: string; source: string }[];
    failedJobs: string[];
    stuckPayments: number;
};

/**
 * What went wrong since the previous run of this job: new error types, cron jobs whose last run failed,
 * and card payments that just crossed the "stuck" line. Each item is reported once.
 */
export async function collectAdminAlerts(prisma: PrismaClient, now = new Date()): Promise<AdminAlertSummary> {
    // წინა გაშვების დასასრული. runJob ამ გაშვების დასასრულს მხოლოდ ამის შემდეგ ჩაწერს.
    const job = await prisma.systemJob.findUnique({ where: { name: ADMIN_ALERTS_JOB }, select: { lastFinishedAt: true } });
    const floor = new Date(now.getTime() - 24 * HOUR);
    const since = job?.lastFinishedAt && job.lastFinishedAt > floor ? job.lastFinishedAt : new Date(now.getTime() - HOUR);
    const [errors, jobs, stuck] = await Promise.all([
        prisma.systemError.findMany({ where: { firstAt: { gt: since, lte: now } }, orderBy: { firstAt: "asc" }, select: { message: true, source: true }, take: 20 }),
        prisma.systemJob.findMany({ where: { lastOk: false, lastFinishedAt: { gt: since, lte: now }, name: { not: ADMIN_ALERTS_JOB } }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.bankPayment.count({ where: { status: "PENDING", createdAt: { gt: new Date(since.getTime() - STUCK_MS), lte: new Date(now.getTime() - STUCK_MS) } } }),
    ]);
    return { since: since.toISOString(), newErrors: errors, failedJobs: jobs.map(item => item.name), stuckPayments: stuck };
}

export function alertMessage(summary: AdminAlertSummary): PushMessage | null {
    const lines: string[] = [];
    if (summary.failedJobs.length) lines.push(`ჩავარდა: ${summary.failedJobs.join(", ")}`);
    if (summary.newErrors.length) lines.push(`${summary.newErrors.length} ახალი შეცდომა: ${summary.newErrors[0].message.slice(0, 80)}`);
    if (summary.stuckPayments) lines.push(`${summary.stuckPayments} ბარათის გადახდას ბანკი არ პასუხობს`);
    if (!lines.length) return null;
    const onlyPayments = !summary.failedJobs.length && !summary.newErrors.length;
    return {
        title: onlyPayments ? "გაჭედილი გადახდა" : "მართეო: სისტემას ყურადღება სჭირდება",
        body: lines.join("\n"),
        url: onlyPayments ? "/admin/payments?view=bank&status=STUCK" : "/admin/system",
        tag: "admin-alerts",
    };
}

/** Hourly: one summary push (nothing when all is well). Returns the number of reported items. */
export async function deliverAdminAlerts(prisma: PrismaClient, now = new Date()) {
    const summary = await collectAdminAlerts(prisma, now);
    const message = alertMessage(summary);
    if (message) await sendAdminPush(prisma, message);
    return { summary, pushed: Boolean(message) };
}
