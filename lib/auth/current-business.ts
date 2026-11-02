import "server-only";
import { cache } from "react";
import { createPrismaClient } from "@/lib/prisma";
import { getPgDashboardContext } from "./pg-dashboard-context";

export const getCurrentBusiness = cache(async () => (await getPgDashboardContext())?.membership ?? null);

// Every business the signed-in user belongs to, for the business switcher.
export const getUserBusinesses = cache(async () => {
    const user = (await getPgDashboardContext())?.user;
    if (!user) return [];
    const prisma = createPrismaClient();
    try {
        const memberships = await prisma.businessMembership.findMany({
            where: { userId: user.id },
            orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
            select: { role: true, status: true, business: { select: { id: true, name: true, logoUrl: true } } },
        });
        // გაყინული ბიზნესიც ჩანს გადამრთველში, ოღონდ გადართვის გარეშე.
        return memberships.map(({ role, status, business }) => ({ ...business, role, frozen: status !== "ACTIVE" }));
    } finally {
        await prisma.$disconnect();
    }
});

export async function hasFrozenMembership(userId: string) {
    const prisma = createPrismaClient();
    try {
        return Boolean(await prisma.businessMembership.findFirst({ where: { userId, status: "FROZEN" }, select: { id: true } }));
    } finally {
        await prisma.$disconnect();
    }
}
