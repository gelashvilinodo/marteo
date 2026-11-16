import { adminRoute } from "@/lib/admin/admin-route";
import { syncBankPayment } from "@/lib/admin/bank-payments";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string; attemptId: string }> };

export async function POST(request: Request, context: Context) {
    const { businessId, attemptId } = await context.params;
    return adminRoute(({ prisma }) => syncBankPayment(prisma, businessId, attemptId), "empty")(request);
}
