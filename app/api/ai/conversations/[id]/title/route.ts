import { apiAccessDenied } from "@/lib/business/access";
import { orderJson } from "@/lib/orders/order-http";
import { guardMutation } from "@/lib/security/mutation-request";
import { reserveLimits } from "@/lib/security/rate-limit";
import { ensureConversationTitle, readConversationId } from "@/lib/ai/ai-conversations";
import { withAiHistory } from "@/lib/ai/ai-conversations-http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const { id } = await params;

    return guardMutation(async () => withAiHistory(async (prisma, owner) => {
        await reserveLimits(prisma, [{ scope: "ai-title", identity: owner.businessId, maximum: 200, seconds: 24 * 60 * 60 }]);
        const title = await ensureConversationTitle(prisma, owner, readConversationId(id));
        return orderJson({ success: true, title });
    }), "empty")(request);
}
