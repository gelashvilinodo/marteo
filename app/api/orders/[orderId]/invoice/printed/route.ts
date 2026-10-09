import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

function json(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        if (request.headers.get("origin") !== new URL(request.url).origin) {
            return json({ success: false, message: "მოთხოვნის წყარო დაუშვებელია." }, 403);
        }
        const user = await getCurrentUser();
        if (!user) return json({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        let data: unknown;
        try { data = await request.json(); }
        catch { return json({ success: false, message: "მონაცემების ფორმატი არასწორია." }, 400); }
        const version = data && typeof data === "object" && "version" in data ? data.version : undefined;
        if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) {
            return json({ success: false, message: "ინვოისის ვერსია არასწორია." }, 422);
        }
        prisma = createPrismaClient();
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { businessId: "asc" }], select: { businessId: true },
        });
        if (!membership) return json({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        const { orderId } = await context.params;
        const where = { id: orderId, businessId: membership.businessId, deletedAt: null };
        const printedAt = new Date();
        const result = await prisma.order.updateMany({
            where: { ...where, invoiceVersion: version },
            data: { lastPrintedInvoiceVersion: version, invoicePrintedAt: printedAt },
        });
        if (!result.count) {
            const order = await prisma.order.findFirst({ where, select: { id: true } });
            return json({ success: false, message: order
                ? "ინვოისი შეიცვალა. განაახლე გვერდი და დაბეჭდე ახალი ვერსია."
                : "შეკვეთა ვერ მოიძებნა." }, order ? 409 : 404);
        }
        return json({ success: true, printedAt: printedAt.toISOString(), version });
    } catch (cause: unknown) {
        console.error("Invoice print confirmation failed", cause instanceof Error ? cause.name : "UnknownError");
        return json({ success: false, message: "დაბეჭდვის მონიშვნა ვერ მოხერხდა. სცადე ხელახლა." }, 500);
    } finally { if (prisma) await prisma.$disconnect(); }
}
