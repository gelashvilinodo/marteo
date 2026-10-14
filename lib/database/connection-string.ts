import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getConnectionString() {
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

