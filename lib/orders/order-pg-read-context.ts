import { createHash } from "crypto";
import { cookies } from "next/headers";
import { createPgReader } from "@/lib/database/pg-reader";
import { orderJson, orderError } from "./order-http";

type SessionRow = { expiresAt: Date; status: string; businessId: string | null };

export async function withOrderPgReadContext(
    read: (client: ReturnType<typeof createPgReader>, businessId: string) => Promise<Response>,
) {
    let client: ReturnType<typeof createPgReader> | undefined;
    try {
        const token = (await cookies()).get("marteo_session")?.value;
        if (!token) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        const tokenHash = createHash("sha256").update(token).digest("hex");
        client = createPgReader();
        const [session] = await client.$queryRaw<SessionRow[]>`
            SELECT s."expiresAt", u.status::text AS status, m."businessId"
            FROM "Session" s JOIN "User" u ON u.id = s."userId"
            LEFT JOIN LATERAL (
                SELECT "businessId" FROM "BusinessMembership"
                WHERE "userId" = u.id ORDER BY "createdAt" ASC LIMIT 1
            ) m ON true WHERE s."tokenHash" = ${tokenHash} LIMIT 1
        `;
        if (!session) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        if (session.expiresAt <= new Date()) {
            // Preserve existing session-expiry cleanup; no business data writes.
            await client.$queryRaw`DELETE FROM "Session" WHERE "tokenHash" = ${tokenHash}`;
            return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        }
        if (session.status !== "ACTIVE") return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        if (!session.businessId) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        return await read(client, session.businessId);
    } catch (cause) {
        return orderError(cause);
    } finally {
        if (client) await client.$disconnect();
    }
}
