import { adminRoute } from "@/lib/admin/admin-route";
import { recordPayment } from "@/lib/admin/payments";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

export async function POST(request: Request, context: Context) {
    const { businessId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as Record<string, unknown>;
        return recordPayment(prisma, admin.id, businessId, body);
    }, "json")(request);
}
