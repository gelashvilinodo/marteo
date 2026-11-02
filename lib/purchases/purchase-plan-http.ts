import "server-only";

import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import { orderJson } from "@/lib/orders/order-http";
import { createPrismaClient } from "@/lib/prisma";
import { PurchasePlanError } from "./purchase-plan";

type Handler = (prisma: ReturnType<typeof createPrismaClient>, businessId: string) => Promise<Response>;

// ბაზაში ცხრილი ჯერ არ არის (migration გაუშვებელია). სია მაშინ უბრალოდ მიუწვდომელია
// და გვერდი შეცდომის ნაცვლად მშვიდ შეტყობინებას აჩვენებს.
function isMissingTable(error: unknown) {
    const text = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? "")}` : "";
    const code = (error as { code?: unknown } | null)?.code;
    return text.includes("PurchasePlanItem") && (code === "P2021" || /does not exist|42P01/.test(text));
}

export const PLAN_UNAVAILABLE = "შესაძენი სია ჯერ არ არის ჩართული — ბაზას განახლება სჭირდება.";

// სია შესყიდვების ნაწილია და მხოლოდ იმ ბიზნესებს ჩანს, ვისაც შესყიდვები აქვს.
export async function withPurchasePlan(handler: Handler, unavailable?: () => Response) {
    const context = await getPgDashboardContext();

    if (!context) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
    if (!context.membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
    if (!hasBusinessFeature(context.membership.business.mode, "imports")) {
        return orderJson({ success: false, message: "შესაძენი სია ამ ბიზნესისთვის მიუწვდომელია." }, 403);
    }

    const prisma = createPrismaClient();

    try {
        return await handler(prisma, context.membership.businessId);
    } catch (error) {
        if (isMissingTable(error)) {
            return unavailable?.() ?? orderJson({ success: false, unavailable: true, message: PLAN_UNAVAILABLE }, 503);
        }

        if (error instanceof PurchasePlanError) {
            return orderJson({ success: false, message: error.message }, error.status);
        }

        console.error("Purchase plan request failed", error instanceof Error ? error.name : "UnknownError");
        return orderJson({ success: false, message: "შესაძენი სია ვერ განახლდა. სცადე ხელახლა." }, 500);
    } finally {
        await prisma.$disconnect();
    }
}
