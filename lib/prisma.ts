import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function getConnectionString() {
  try {
    const { env } = getCloudflareContext();

    if (env.HYPERDRIVE?.connectionString) {
      return env.HYPERDRIVE.connectionString;
    }
  } catch {
    // Local Next.js development
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

export function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getConnectionString(),
    max: 1,
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}