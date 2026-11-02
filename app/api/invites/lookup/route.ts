import { getCurrentUser } from "@/lib/auth/session";
import { lookupInvite, readInviteToken } from "@/lib/business/invite-accept";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, requestIp, reserveLimits } from "@/lib/security/rate-limit";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// ტოკენი body-ში მოდის და არა URL-ში, რომ ლოგებში არ დარჩეს.
async function post(request: Request) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = readInviteToken(body?.token);
    if (!token) return json({ success: false, state: "invalid" }, 404);
    const db = createPrismaClient();
    try {
        await reserveLimits(db, [{ scope: "invite-lookup-ip", identity: requestIp(request), maximum: 30, seconds: 600 }]);
        const found = await lookupInvite(db, token);
        if (!found) return json({ success: false, state: "invalid" }, 404);
        if (found.expired) return json({ success: false, state: "expired" }, 410);
        const user = await getCurrentUser();
        return json({ success: true, state: "ready", invite: found.invite, signedInEmail: user?.email ?? null });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Invite lookup failed", error instanceof Error ? error.message : "UnknownError");
        return json({ success: false, message: "მოწვევის შემოწმება ვერ მოხერხდა. სცადე ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
