import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPgReader } from "@/lib/database/pg-reader";
import { orderJson } from "@/lib/orders/order-http";
import { getPurchaseFormOptions } from "@/lib/purchases/get-purchase-form-options";

export async function GET() {
    const context = await getPgDashboardContext();

    if (!context) {
        return orderJson(
            { success: false, message: "გაიარე ავტორიზაცია." },
            401,
        );
    }

    if (!context.membership) {
        return orderJson(
            { success: false, message: "ბიზნესი ვერ მოიძებნა." },
            403,
        );
    }

    const reader = createPgReader();

    try {
        const data = await getPurchaseFormOptions(
            reader,
            context.membership.businessId,
        );

        return orderJson({ success: true, data });
    } catch (cause: unknown) {
        console.error(
            "Purchase form options failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return orderJson(
            {
                success: false,
                message:
                    "პარტიის ფორმის მონაცემები ვერ ჩაიტვირთა. სცადე ხელახლა.",
            },
            500,
        );
    } finally {
        await reader.$disconnect();
    }
}