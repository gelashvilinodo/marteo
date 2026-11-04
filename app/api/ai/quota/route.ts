import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { getAiQuota } from "@/lib/ai/ai-usage";

export const dynamic = "force-dynamic";

// AI პანელის მრიცხველისთვის: ამ თვეში გამოყენებული და ლიმიტი.
export async function GET() {
    const accessDenied = await apiAccessDenied("OWNER", "view"); if (accessDenied) return accessDenied;
    const context = await getPgDashboardContext();
    if (!context?.membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
    const prisma = createPrismaClient();
    try {
        return orderJson({ success: true, quota: await getAiQuota(prisma, context.membership.businessId) });
    } catch (error) {
        console.error("AI quota read failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "ლიმიტი ვერ ჩაიტვირთა." }, 500);
    } finally {
        await prisma.$disconnect();
    }
}
