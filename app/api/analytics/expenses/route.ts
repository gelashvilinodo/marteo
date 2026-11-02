import { apiAccessDenied } from "@/lib/business/access";
import { createExpense } from "@/lib/analytics/create-expense";
import {
    readOrderBody,
    orderJson,
    orderError,
} from "@/lib/orders/order-http";

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("FINANCE", "edit"); if (accessDenied) return accessDenied;
    try {
        const body = await readOrderBody(request);
        const expense = await createExpense(body);

        return orderJson({
            success: true,
            expense,
        });
    } catch (cause: unknown) {
        return orderError(cause);
    }
}