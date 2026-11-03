import { orderJson } from "@/lib/orders/order-http";
import { guardMutation } from "@/lib/security/mutation-request";
import {
    deleteConversation,
    getConversation,
    readConversationId,
    sanitizeMessages,
    saveConversation,
} from "@/lib/ai/ai-conversations";
import { withAiHistory } from "@/lib/ai/ai-conversations-http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
    const { id } = await params;

    return withAiHistory(async (prisma, owner) =>
        orderJson({ success: true, conversation: await getConversation(prisma, owner, readConversationId(id)) }));
}

export async function PUT(request: Request, { params }: Context) {
    const { id } = await params;

    return guardMutation(async (guarded) => {
        const body = await guarded.json().catch(() => null) as { messages?: unknown; title?: unknown } | null;

        return withAiHistory(async (prisma, owner) => {
            const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) || null : null;
            const saved = await saveConversation(prisma, owner, readConversationId(id), sanitizeMessages(body?.messages), title);
            return orderJson({ success: true, ...saved });
        }, "edit");
    })(request);
}

export async function DELETE(request: Request, { params }: Context) {
    const { id } = await params;

    return guardMutation(async () => withAiHistory(async (prisma, owner) => {
        await deleteConversation(prisma, owner, readConversationId(id));
        return orderJson({ success: true });
    }, "edit"), "empty")(request);
}
