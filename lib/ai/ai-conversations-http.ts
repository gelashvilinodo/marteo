import "server-only";

import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { AiConversationError } from "./ai-conversations";

type Handler = (
    prisma: ReturnType<typeof createPrismaClient>,
    owner: { businessId: string; userId: string },
) => Promise<Response>;

// წვდომას (იგივე, რაც მართეო AI-ს აქვს) თითო როუტი თვითონ ამოწმებს, რომ ბილდის შემოწმებამ დაინახოს.
// თითო მომხმარებელი მხოლოდ თავის ჩათებს ხედავს.
export async function withAiHistory(handler: Handler) {
    const context = await getPgDashboardContext();
    if (!context) return orderJson({ success: false, message: "გაიარეთ ავტორიზაცია." }, 401);
    if (!context.membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);

    const prisma = createPrismaClient();

    try {
        return await handler(prisma, { businessId: context.membership.businessId, userId: context.user.id });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;

        if (error instanceof AiConversationError) {
            return orderJson({ success: false, message: error.message }, error.status);
        }

        console.error("Marteo AI history failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "ჩათების ისტორია დროებით მიუწვდომელია." }, 500);
    } finally {
        await prisma.$disconnect();
    }
}
