import { getCurrentUser } from "@/lib/auth/session";
import { AdminActionError } from "@/lib/admin/actions";
import { acceptAdminInvite, readAdminInviteToken } from "@/lib/admin/admin-team";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, requestIp, reserveLimits } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function post(request: Request) {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const token = readAdminInviteToken(body.token);
    if (!token) return json({ success: false, message: "მოწვევის ბმული არასწორია." }, 404);
    const db = createPrismaClient();
    try {
        await reserveLimits(db, [
            { scope: "admin-invite-accept-ip", identity: requestIp(request), maximum: 10, seconds: 600 },
            { scope: "admin-invite-accept-token", identity: token.slice(0, 16), maximum: 6, seconds: 600 },
        ]);
        const user = await getCurrentUser();
        const password = typeof body.password === "string" ? body.password : "";
        if (body.mode !== "signed-in" && (!password || password.length > 200)) throw new AdminActionError("ჩაწერეთ პაროლი.");
        const result = await acceptAdminInvite(db, token, body.mode === "signed-in" && user
            ? { kind: "signed-in", userId: user.id }
            : { kind: "password", password });

        // შემდეგი ნაბიჯი: ორეტაპიანი შესვლის ჩართვა ადმინ პანელისთვის.
        const response = json({ success: true, redirectTo: "/admin-login" });
        if (result.session) {
            response.cookies.set("marteo_session", result.session.token, {
                httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: result.session.expiresAt, path: "/",
            });
        }
        return response;
    } catch (error) {
        if (error instanceof AdminActionError) return json({ success: false, message: error.message }, error.status);
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Admin invite accept failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "მოწვევის მიღება ვერ მოხერხდა. სცადეთ ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
