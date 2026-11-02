import { guardMutation } from "@/lib/security/mutation-request";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { activeBusinessCookieOptions, ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";
import { createPrismaClient } from "@/lib/prisma";

async function post(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ავტორიზაცია საჭიროა." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { businessId?: unknown } | null;
    const businessId = typeof body?.businessId === "string" ? body.businessId : "";
    if (!businessId) return NextResponse.json({ error: "აირჩიე ბიზნესი." }, { status: 422 });

    const prisma = createPrismaClient();
    try {
        const membership = await prisma.businessMembership.findUnique({
            where: { userId_businessId: { userId: user.id, businessId } },
            select: { businessId: true, status: true },
        });
        if (!membership || membership.status !== "ACTIVE") return NextResponse.json({ error: "ეს ბიზნესი ვერ მოიძებნა." }, { status: 404 });

        const response = NextResponse.json({ businessId: membership.businessId });
        response.cookies.set(ACTIVE_BUSINESS_COOKIE, membership.businessId, activeBusinessCookieOptions);
        return response;
    } catch (error) {
        console.error("Business switch error:", error);
        return NextResponse.json({ error: "ბიზნესის გადართვა ვერ მოხერხდა." }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
export const POST = guardMutation(post, "json");
