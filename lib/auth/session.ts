import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { getPgDashboardContext } from "./pg-dashboard-context";

import type { createPrismaClient } from "@/lib/prisma";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// The caller owns this request's client and disconnects it after all queries.
// A factory keeps unauthenticated requests from creating a database client.
export async function getCurrentUserWithClient(
  getClient: () => ReturnType<typeof createPrismaClient>,
) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("marteo_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const prisma = getClient();

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
}

export const getCurrentUser = cache(async () => (await getPgDashboardContext())?.user ?? null);
