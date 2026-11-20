import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { readCheckoutResult } from "@/lib/subscription/bank";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// ბანკიდან დაბრუნების გვერდი რამდენიმე წამში ერთხელ კითხულობს: სტატუსს ბანკს ვეკითხებით და დადასტურებისთანავე
// გეგმა/პაკეტი ირთვება, callback-ის და cron-ის მოლოდინის გარეშე. მხოლოდ მფლობელი, მხოლოდ საკუთარი ბიზნესის გადახდა.
async function post(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "view", { allowLocked: true }); if (accessDenied) return accessDenied;
    const context = (await getPgDashboardContext())!;
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    const id = body?.id;
    if (typeof id !== "string" || !/^[a-z0-9]{10,40}$/.test(id)) return json({ success: false }, 422);
    const db = createPrismaClient();
    try {
        const result = await readCheckoutResult(db, context.membership!.businessId, id);
        if (!result) return json({ success: false }, 404);
        return json({ success: true, status: result.status });
    } catch (error) {
        console.error("Payment status check failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post);
