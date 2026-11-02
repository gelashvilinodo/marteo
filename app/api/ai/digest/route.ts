import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";
import { buildWeeklyDigest } from "@/lib/ai/weekly-digest";

export const dynamic = "force-dynamic";

// ბრაუზერი ამას კვირაში ერთხელ ითხოვს; ლიმიტი მხოლოდ ზედმეტ გამოძახებას აჩერებს.
export async function GET() {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const context = await getPgDashboardContext();

    if (!context) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
    if (!context.membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);

    const prisma = createPrismaClient();

    try {
        const { businessId, business } = context.membership;
        await reserveLimits(prisma, [{ scope: "ai-digest", identity: businessId, maximum: 20, seconds: 24 * 60 * 60 }]);

        const digest = await buildWeeklyDigest(prisma, businessId, new Date(), hasBusinessFeature(business.mode, "imports"));
        return orderJson({ success: true, digest });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;

        console.error("Marteo AI digest failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "მიმოხილვა ვერ მომზადდა." }, 500);
    } finally {
        await prisma.$disconnect();
    }
}
