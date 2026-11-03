import { apiAccessDenied } from "@/lib/business/access";
import { orderJson } from "@/lib/orders/order-http";
import { listConversations } from "@/lib/ai/ai-conversations";
import { withAiHistory } from "@/lib/ai/ai-conversations-http";

export const dynamic = "force-dynamic";

export async function GET() {
    const accessDenied = await apiAccessDenied("OWNER", "view"); if (accessDenied) return accessDenied;
    return withAiHistory(async (prisma, owner) =>
        orderJson({ success: true, conversations: await listConversations(prisma, owner) }));
}
