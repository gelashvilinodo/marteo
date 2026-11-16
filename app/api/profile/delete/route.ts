import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUserWithClient } from "@/lib/auth/session";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { ADMIN_DEVICE_COOKIE } from "@/lib/admin/authorization";
import { sendAdminPush } from "@/lib/admin/admin-push";
import { deleteAccount, planAccountDeletion } from "@/lib/account/delete-account";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// დიალოგისთვის: რა ბედი ეწევა თითოეულ ბიზნესს.
export async function GET() {
    const prisma = createPrismaClient();
    try {
        const user = await getCurrentUserWithClient(() => prisma);
        if (!user) return json({ success: false, message: "გთხოვთ, ხელახლა შეხვიდეთ." }, 401);
        const plan = await planAccountDeletion(prisma, user.id);
        if (!plan) return json({ success: false, message: "ანგარიში ვერ მოიძებნა." }, 404);
        return json({ success: true, blocked: plan.isPlatformAdmin, businesses: plan.businesses });
    } finally { await prisma.$disconnect(); }
}

// ანგარიშის სამუდამო წაშლა პაროლით. ადმინის ანგარიში აქედან არ იშლება.
async function post(request: Request) {
    const prisma = createPrismaClient();
    try {
        const user = await getCurrentUserWithClient(() => prisma);
        if (!user) return json({ success: false, message: "გთხოვთ, ხელახლა შეხვიდეთ." }, 401);
        await reserveLimits(prisma, [{ scope: "account-delete", identity: user.id, maximum: 5, seconds: 600 }]);
        const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
        const password = typeof body.password === "string" ? body.password : "";
        const account = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true, isPlatformAdmin: true } });
        if (!account) return json({ success: false, message: "ანგარიში ვერ მოიძებნა." }, 404);
        if (account.isPlatformAdmin) return json({ success: false, message: "პლატფორმის ადმინის ანგარიშის წაშლა შეუძლებელია." }, 403);
        if (!password || password.length > 200 || !await bcrypt.compare(password, account.password)) {
            return json({ success: false, message: "პაროლი არასწორია." }, 401);
        }
        const plan = await deleteAccount(prisma, user.id, { goodbyeEmail: true });
        const deleted = plan?.businesses.filter(business => business.fate === "delete").length ?? 0;
        await sendAdminPush(prisma, {
            title: "მომხმარებელმა ანგარიში წაშალა",
            body: deleted ? `წაიშალა ${deleted} ბიზნესიც.` : "ბიზნესი არ წაშლილა.",
            url: "/admin/users", tag: "account-deleted",
        });
        const response = json({ success: true, message: "ანგარიში წაიშალა." });
        for (const name of ["marteo_session", ACTIVE_BUSINESS_COOKIE, ADMIN_DEVICE_COOKIE]) response.cookies.delete(name);
        return response;
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Account delete failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "ანგარიშის წაშლა ვერ მოხერხდა. სცადეთ ხელახლა." }, 500);
    } finally { await prisma.$disconnect(); }
}

export const POST = guardMutation(post, "json");
