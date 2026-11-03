import { orderJson } from "@/lib/orders/order-http";
import { listConversations } from "@/lib/ai/ai-conversations";
import { withAiHistory } from "@/lib/ai/ai-conversations-http";

export const dynamic = "force-dynamic";

export async function GET() {
    return withAiHistory(async (prisma, owner) =>
        orderJson({ success: true, conversations: await listConversations(prisma, owner) }));
}
