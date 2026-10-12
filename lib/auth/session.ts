import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";

import { createPrismaClient } from "@/lib/prisma";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("marteo_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const prisma = createPrismaClient();

  try {
    const session = await prisma.session.findUnique({
      where: {
        tokenHash,
      },
      select: {
        userId: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt <= new Date()) {
      await prisma.session.deleteMany({
        where: {
          tokenHash,
        },
      });

      return null;
    }

    if (session.user.status !== "ACTIVE") {
      return null;
    }

    return session.user;
  } finally {
    await prisma.$disconnect();
  }
});