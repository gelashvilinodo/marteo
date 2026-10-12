import "server-only";

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

export const getCurrentBusiness = cache(async () => {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const prisma = createPrismaClient();

    try {
        return await prisma.businessMembership.findFirst({
            where: {
                userId: user.id,
            },
            orderBy: {
                createdAt: "asc",
            },
            select: {
                businessId: true,
                business: {
                    select: {
                        id: true,
                        name: true,
                        logoUrl: true,
                    },
                },
            },
        });
    } finally {
        await prisma.$disconnect();
    }
});