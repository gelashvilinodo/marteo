import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { activeBusinessCookieOptions, ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { acceptInvite, readInviteToken, readNewAccount } from "@/lib/business/invite-accept";
import { TeamError } from "@/lib/business/team-server";
import { createPrismaClient } from "@/lib/prisma";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, requestIp, reserveLimits } from "@/lib/security/rate-limit";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function post(request: Request) {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const token = readInviteToken(body.token);
    if (!token) return json({ success: false, message: "მოწვევის ბმული არასწორია." }, 404);
    const db = createPrismaClient();
    try {
        await reserveLimits(db, [
            { scope: "invite-accept-ip", identity: requestIp(request), maximum: 20, seconds: 600 },
            { scope: "invite-accept-token", identity: token.slice(0, 16), maximum: 10, seconds: 600 },
        ]);
        const user = await getCurrentUser();
        const input = body.mode === "new"
            ? { kind: "new" as const, account: readNewAccount(body) }
            : body.mode === "signed-in" && user
                ? { kind: "signed-in" as const, userId: user.id }
                : { kind: "existing" as const, password: typeof body.password === "string" ? body.password : "" };
        if (input.kind === "existing" && !input.password) throw new TeamError("ჩაწერე პაროლი.");

        const result = await acceptInvite(db, token, input);
        if (result.notifyUserId) {
            const pushClient = createPrismaClient();
            runInBackground(sendPushToUsers(pushClient, [result.notifyUserId], {
                title: "ახალი წევრი გუნდში", body: result.message, url: "/dashboard/business-settings", tag: "team",
            }).finally(() => pushClient.$disconnect()));
        }

        const response = json({ success: true, redirectTo: "/dashboard" });
        if (result.session) {
            response.cookies.set("marteo_session", result.session.token, {
                httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: result.session.expiresAt, path: "/",
            });
        }
        // მიღების შემდეგ მომხმარებელი პირდაპირ ახალ ბიზნესში ხვდება.
        response.cookies.set(ACTIVE_BUSINESS_COOKIE, result.businessId, activeBusinessCookieOptions);
        return response;
    } catch (error) {
        if (error instanceof TeamError) return json({ success: false, message: error.message }, error.status);
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Invite accept failed", error instanceof Error ? error.message : "UnknownError");
        return json({ success: false, message: "მოწვევის მიღება ვერ მოხერხდა. სცადე ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
