import { adminRoute } from "@/lib/admin/admin-route";
import { voidPayment } from "@/lib/admin/payments";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string; paymentId: string }> };

export async function POST(request: Request, context: Context) {
    const { businessId, paymentId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as { reason?: unknown };
        return voidPayment(prisma, admin.id, businessId, paymentId, body.reason);
    }, "json")(request);
}
