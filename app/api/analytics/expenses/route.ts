import { createExpense } from "@/lib/analytics/create-expense";
import {
    readOrderBody,
    orderJson,
    orderError,
} from "@/lib/orders/order-http";

export async function POST(request: Request) {
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