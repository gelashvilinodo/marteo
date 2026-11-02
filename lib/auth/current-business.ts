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
            select: { business: { select: { id: true, name: true, logoUrl: true } } },
        });
        return memberships.map(({ business }) => business);
    } finally {
        await prisma.$disconnect();
    }
});
