import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getConnectionString } from "./database/connection-string";


export function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getConnectionString(),
    max: 1,
  });

  return new PrismaClient({ adapter });
}
