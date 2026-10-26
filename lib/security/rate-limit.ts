import "server-only";
import { createHash } from "crypto";
import { isIP } from "node:net";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";

export class RateLimitError extends Error {
    constructor(readonly retryAfter: number) { super("Too many requests"); }
}
export type Limit = { scope: string; identity: string; maximum: number; seconds: number };

// Never trust X-Forwarded-For supplied by an arbitrary client.
export function requestIp(request: Request): string {
    try {
        getCloudflareContext();
        const ip = request.headers.get("cf-connecting-ip") ?? "";
        if (isIP(ip)) {
            // Aggregate IPv6 /64 to avoid trivial address rotation in one subnet.
            if (isIP(ip) === 6) {
                const host = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
                const [left, right = ""] = host.split("::");
                const a = left ? left.split(":") : [];
                const b = right ? right.split(":") : [];
                const groups = host.includes("::") ? [...a, ...Array(8-a.length-b.length).fill("0"), ...b] : a;
                return groups.slice(0,4).map(v=>Number.parseInt(v,16).toString(16)).join(":") + "::/64";
            }
            return ip;
        }
    } catch { /* Local development has no trusted proxy identity. */ }
    return "unavailable";
}

export async function reserveLimits(prisma: PrismaClient, limits: Limit[]) {
    const entries = limits.map(l => ({ ...l, key: l.scope + ":" + createHash("sha256").update(l.identity).digest("hex") })).sort((a,b)=>a.key.localeCompare(b.key));
    // Parameterized, atomic upserts serialize concurrent clients per bucket.
    // A denied request rolls back reservations of all other buckets.
    await prisma.$transaction(async tx => {
        for (const l of entries) {
            const rows = await tx.$queryRaw<{ count: number; retry: number }[]>`
                INSERT INTO "SecurityRateBucket" ("key", "count", "expiresAt")
                VALUES (${l.key}, 1, (clock_timestamp() AT TIME ZONE 'UTC') + make_interval(secs => ${l.seconds}))
                ON CONFLICT ("key") DO UPDATE SET
                    "count" = CASE WHEN "SecurityRateBucket"."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC') THEN 1 ELSE LEAST("SecurityRateBucket"."count" + 1, ${l.maximum + 1}) END,
                    "expiresAt" = CASE WHEN "SecurityRateBucket"."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC') THEN EXCLUDED."expiresAt" ELSE "SecurityRateBucket"."expiresAt" END
                RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - (clock_timestamp() AT TIME ZONE 'UTC')))))::int AS retry
            `;
            if (rows[0].count > l.maximum) throw new RateLimitError(rows[0].retry);
        }
        // Bounded retention cleanup; no timer/polling and no raw identifiers stored.
        await tx.$executeRaw`DELETE FROM "SecurityRateBucket" WHERE "key" IN (SELECT "key" FROM "SecurityRateBucket" WHERE "expiresAt" < (clock_timestamp() AT TIME ZONE 'UTC') ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)`;
    });
}

export function rateLimitResponse(error: unknown) {
    if (!(error instanceof RateLimitError)) return null;
    const message = `მოთხოვნების ლიმიტი ამოიწურა. სცადეთ ხელახლა ${error.retryAfter} წამში.`;
    return NextResponse.json({ success: false, error: message, message, retryAfter: error.retryAfter }, {
        status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" },
    });
}
