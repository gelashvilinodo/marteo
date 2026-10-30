import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";
import { AiChatError, runMarteoAiChat, type AiChatTurn } from "@/lib/ai/marteo-ai-chat";

const MAX_TURNS = 10;
const MAX_TEXT = 2000;

// მხოლოდ ბოლო რამდენიმე ტექსტური შეტყობინება; პირველი ყოველთვის მომხმარებლისაა.
function readTurns(body: unknown): AiChatTurn[] | null {
    const messages = (body as { messages?: unknown }).messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) return null;

    const turns: AiChatTurn[] = [];
    for (const message of messages) {
        const { role, text } = (message ?? {}) as { role?: unknown; text?: unknown };
        if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
        const trimmed = text.trim();
        if (!trimmed || trimmed.length > MAX_TEXT) return null;
        turns.push({ role, text: trimmed });
    }

    const recent = turns.slice(-MAX_TURNS);
    while (recent[0]?.role === "assistant") recent.shift();

    return recent.at(-1)?.role === "user" ? recent : null;
}

export const POST = guardMutation(async (request) => {
    const context = await getPgDashboardContext();

    if (!context) {
        return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
    }

    if (!context.membership) {
        return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
    }

    const turns = readTurns(await request.json());

    if (!turns) {
        return orderJson({ success: false, message: "შეტყობინება არასწორია." }, 400);
    }

    const prisma = createPrismaClient();

    try {
        const businessId = context.membership.businessId;

        await reserveLimits(prisma, [
            { scope: "ai-chat-burst", identity: businessId, maximum: 20, seconds: 10 * 60 },
            { scope: "ai-chat-month", identity: businessId, maximum: 500, seconds: 30 * 24 * 60 * 60 },
        ]);

        const reply = await runMarteoAiChat(turns, context.membership.business.name, {
            businessId,
            prisma,
            now: new Date(),
        });

        return orderJson({ success: true, reply });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;

        if (error instanceof AiChatError) {
            return orderJson({ success: false, message: error.message }, error.status);
        }

        console.error("Marteo AI chat failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "მართეო AI დროებით მიუწვდომელია. სცადე ხელახლა." }, 500);
    } finally {
        await prisma.$disconnect();
    }
});
