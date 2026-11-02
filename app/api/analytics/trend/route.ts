import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    getFinancialTrend,
    type FinancialTrendPeriod,
} from "@/lib/analytics/get-financial-trend";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function GET(request: Request) {
    const accessDenied = await apiAccessDenied("FINANCE", "view"); if (accessDenied) return accessDenied;
    let prisma:
        ReturnType<typeof createPrismaClient> | undefined;

    try {
        const user = await getCurrentUser();

        if (!user) {
            return json({
                success: false,
                message: "გაიარე ავტორიზაცია.",
            }, 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return json({
                success: false,
                message: "ბიზნესი ვერ მოიძებნა.",
            }, 403);
        }

        const value = new URL(request.url)
            .searchParams.get("period") ?? "week";

        if (
            value !== "week" &&
            value !== "month" &&
            value !== "year"
        ) {
            return json({
                success: false,
                message: "აირჩიე დიაგრამის პერიოდი.",
            }, 400);
        }

        const period: FinancialTrendPeriod = value;

        prisma = createPrismaClient();

        const points = await getFinancialTrend(
            prisma,
            membership.businessId,
            period,
        );

        return json({
            success: true,
            period,
            points,
        });
    } catch (cause: unknown) {
        console.error(
            "Financial trend loading failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json({
            success: false,
            message: "დიაგრამა ვერ ჩაიტვირთა. სცადე ხელახლა.",
        }, 500);
    } finally {
        await prisma?.$disconnect();
    }
}