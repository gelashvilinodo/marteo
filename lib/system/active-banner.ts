import "server-only";
import { createPgReader } from "@/lib/database/pg-reader";

export type ActiveBanner = { id: string; message: string; tone: "INFO" | "WARNING" };

// The newest banner whose window covers now. A failure hides the banner instead of breaking the dashboard.
export async function getActiveBanner(): Promise<ActiveBanner | null> {
    const db = createPgReader();
    try {
        const [row] = await db.$queryRaw<ActiveBanner[]>`
            SELECT id, message, tone FROM "SystemBanner"
            WHERE "canceledAt" IS NULL AND "startsAt" <= now() AT TIME ZONE 'UTC'
              AND ("endsAt" IS NULL OR "endsAt" > now() AT TIME ZONE 'UTC')
            ORDER BY "startsAt" DESC LIMIT 1
        `;
        return row ?? null;
    } catch {
        console.error("System banner read failed");
        return null;
    } finally { await db.$disconnect(); }
}
