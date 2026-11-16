import { adminRoute } from "@/lib/admin/admin-route";
import { refundBankPayment } from "@/lib/admin/bank-payments";
import { consumeAdminCode } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string; attemptId: string }> };

export async function POST(request: Request, context: Context) {
    const { businessId, attemptId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as { reason?: unknown; endPlan?: unknown; code?: unknown };
        // ფულის დაბრუნება სანდო მოწყობილობაზეც ახალ კოდს ითხოვს.
        await consumeAdminCode(prisma, admin.id, body.code, guarded);
        return refundBankPayment(prisma, admin.id, businessId, attemptId, body);
    }, "json")(request);
}
