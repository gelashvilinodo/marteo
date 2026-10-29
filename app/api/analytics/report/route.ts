import { getPgDashboardContext } from '@/lib/auth/pg-dashboard-context';
import { createPrismaClient } from '@/lib/prisma';
import { getAccountantReport, ReportError } from '@/lib/analytics/report/get-report';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
    let db: ReturnType<typeof createPrismaClient> | undefined;
    try {
        // Route handlers do not need two independent reads of the same context.
        const context = await getPgDashboardContext();
        if (!context) return json({ error: 'გაიარე ავტორიზაცია.' }, 401);
        const member = context.membership;
        if (!member) return json({ error: 'ბიზნესი ვერ მოიძებნა.' }, 403);
        db = createPrismaClient();
        return json({ document: await db.$transaction(tx => getAccountantReport(tx, member.businessId, new URL(request.url).searchParams), { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 30000 }) });
    }
    catch (e) { console.error('Accountant report failed', { type: e instanceof Error ? e.name : 'unknown' }); return json({ error: e instanceof ReportError ? e.message : 'ანგარიში ვერ მომზადდა. სცადე ხელახლა.' }, e instanceof ReportError ? e.status : 500); }
    finally { if (db) await db.$disconnect(); }
}
