import { NextResponse } from "next/server";
import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

// Registration verifies codes through its dedicated endpoints, not this legacy read API.
export async function GET(request: Request) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    const getClient = () => prisma ??= createPrismaClient();
    const reply = (body: object, status = 200) => NextResponse.json(body, {
        status, headers: { "Cache-Control": "private, no-store" },
    });
    try {
        const user = await getCurrentUserWithClient(getClient);
        if (!user) return reply({ error: "ავტორიზაცია საჭიროა." }, 401);
        const requestedId = new URL(request.url).searchParams.get("userId");
        if (requestedId && requestedId !== user.id) return reply({ error: "წვდომა დაუშვებელია." }, 403);
        const account = await getClient().user.findUnique({
            where: { id: user.id },
            select: { emailVerifiedAt: true, phoneVerifiedAt: true, status: true },
        });
        if (!account) return reply({ error: "ანგარიში ვერ მოიძებნა." }, 404);
        return reply({ emailVerified: Boolean(account.emailVerifiedAt), phoneVerified: Boolean(account.phoneVerifiedAt), status: account.status });
    } catch {
        return reply({ error: "ანგარიშის შემოწმება ვერ მოხერხდა." }, 500);
    } finally { await prisma?.$disconnect(); }
}
