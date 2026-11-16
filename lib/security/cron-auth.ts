import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function cronSecret() {
    try {
        const value = (getCloudflareContext().env as unknown as Record<string, unknown>).CRON_SECRET;
        if (typeof value === "string" && value) return value;
    } catch { /* Local development. */ }
    return process.env.CRON_SECRET ?? "";
}

// Cron routes are called only by worker.mjs with CRON_SECRET.
export function isCronRequest(request: Request) {
    const secret = cronSecret();
    const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (secret.length < 16 || given.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
