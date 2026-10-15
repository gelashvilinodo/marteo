import "server-only";

import { createPgReader } from "@/lib/database/pg-reader";
import { getExpenseBreakdown } from "@/lib/analytics/get-expense-breakdown";

export async function getHomeExpenses(
    businessId: string,
    from: string,
    to: string,
) {
    const reader = createPgReader();

    try {
        return await getExpenseBreakdown(
            reader,
            businessId,
            from,
            to,
        );
    } finally {
        await reader.$disconnect();
    }
}