import "server-only";
import { cookies } from "next/headers";

import type { createPrismaClient } from "@/lib/prisma";

// Which of the user's businesses this device is working in. It is only a
// preference: every read checks it against BusinessMembership, so a stale or
// foreign id falls back to the user's first business.
export const ACTIVE_BUSINESS_COOKIE = "marteo_business";

export const activeBusinessCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
};

export async function getActiveBusinessPreference() {
    return (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value ?? "";
}

type MembershipClient = Pick<ReturnType<typeof createPrismaClient>, "businessMembership">;

export async function findActiveMembership(client: MembershipClient, userId: string) {
    const preferred = await getActiveBusinessPreference();
    const select = { businessId: true, role: true } as const;
    if (preferred) {
        const membership = await client.businessMembership.findUnique({
            where: { userId_businessId: { userId, businessId: preferred } },
            select,
        });
        if (membership) return membership;
    }
    return client.businessMembership.findFirst({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
        select,
    });
}
