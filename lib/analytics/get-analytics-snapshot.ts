import "server-only";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAnalyticsPage, type AnalyticsSearchParams } from "./get-analytics-page";
import { getFinancialMovements } from "./get-financial-movements";
import { getCurrentBalances } from "./get-current-balances";
import { getFinancialTrend, type FinancialTrendPeriod } from "./get-financial-trend";
import { getExpenseBreakdown } from "./get-expense-breakdown";

// One repeatable-read snapshot keeps financial summaries and lists consistent.
export async function getAnalyticsSnapshot(businessId: string, params: AnalyticsSearchParams, trendPeriod: FinancialTrendPeriod = "week") {
    const prisma = createPrismaClient();
    try {
        return await prisma.$transaction(
            async tx => {
                const data = await getAnalyticsPage(
                    tx,
                    businessId,
                    params,
                );

                const movements = await getFinancialMovements(
                    tx,
                    businessId,
                    data.from,
                    data.to,
                    params,
                );

                const balances = await getCurrentBalances(
                    tx,
                    businessId,
                );

                const trend = await getFinancialTrend(
                    tx,
                    businessId,
                    trendPeriod,
                );

                const expenseBreakdown = await getExpenseBreakdown(
                    tx,
                    businessId,
                    data.from,
                    data.to,
                );

                return {
                    data: {
                        ...data,
                        ...balances,
                    },
                    movements,
                    trend,
                    expenseBreakdown,
                    trendPeriod,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.RepeatableRead,
                maxWait: 10000,
                timeout: 15000,
            },
        );
    } finally {
        await prisma.$disconnect();
    }

}
export type AnalyticsSnapshot = Awaited<ReturnType<typeof getAnalyticsSnapshot>>;
