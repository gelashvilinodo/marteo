import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ბიზნესში ადრე ჩაწერილი ბანკები, ბოლოს გამოყენებული პირველი: გადარიცხვისას შემოთავაზებად ჩანს.
export async function GET() {
    const accessDenied = await apiAccessDenied("ORDERS", "view"); if (accessDenied) return accessDenied;
    const membership = await getCurrentBusiness();
    if (!membership) return Response.json({ success: false }, { status: 403 });
    const prisma = createPrismaClient();
    try {
        const rows = await prisma.$queryRaw<{ name: string }[]>`
            SELECT name FROM (
                SELECT DISTINCT ON (lower(btrim(p."bankName"))) btrim(p."bankName") AS name, p."createdAt"
                FROM "OrderPayment" p JOIN "Order" o ON o.id = p."orderId"
                WHERE o."businessId" = ${membership.businessId} AND btrim(coalesce(p."bankName", '')) <> ''
                ORDER BY lower(btrim(p."bankName")), p."createdAt" DESC
            ) used
            ORDER BY "createdAt" DESC
            LIMIT 30
        `;
        return Response.json({ success: true, banks: rows.map(row => row.name) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return Response.json({ success: false, banks: [] }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
