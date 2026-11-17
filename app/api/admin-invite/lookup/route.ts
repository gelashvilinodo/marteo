import { getCurrentUser } from "@/lib/auth/session";
import { lookupAdminInvite, readAdminInviteToken } from "@/lib/admin/admin-team";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { rateLimitResponse, requestIp, reserveLimits } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// ტოკენი body-ში მოდის და არა URL-ში, რომ ლოგებში არ დარჩეს.
async function post(request: Request) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = readAdminInviteToken(body?.token);
    if (!token) return json({ success: false, state: "invalid" }, 404);
    const db = createPrismaClient();
    try {
        await reserveLimits(db, [{ scope: "admin-invite-lookup-ip", identity: requestIp(request), maximum: 20, seconds: 600 }]);
        const found = await lookupAdminInvite(db, token);
        if (found.state === "invalid") return json({ success: false, state: "invalid" }, 404);
        if (found.state === "expired") return json({ success: false, state: "expired" }, 410);
        const user = await getCurrentUser();
        return json({ success: true, ...found, signedInEmail: user?.email ?? null });
    } catch (error) {
        const limited = rateLimitResponse(error);
        if (limited) return limited;
        console.error("Admin invite lookup failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "მოწვევის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა." }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
