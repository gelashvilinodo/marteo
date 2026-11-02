import "server-only";
import { createHash } from "node:crypto";
import { createPgReader } from "@/lib/database/pg-reader";
import { getCourierReminder } from "./get-courier-reminder";
import { OrderValidationError } from "./order-validation-error";
import { getActiveBusinessPreference } from "@/lib/auth/active-business";
import { canManageBusinessArea } from "@/lib/business/permissions";

type AccessRow = {
    expiresAt: Date;
    status: string;
    businessId: string | null;
    role: string | null;
    permissions: string[] | null;
    readOnly: boolean | null;
};

// One request-owned connection and snapshot for session, membership and balance.
// Never cache a user's authorization or financial data across requests.
export async function readCourierReminder(token: string | undefined) {
    if (!token) throw new OrderValidationError("გაიარე ავტორიზაცია.", 401);

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const preferred = await getActiveBusinessPreference();
    const reader = createPgReader();
    try {
        return await reader.withReadTransaction(async tx => {
            const [access] = await tx.$queryRaw<AccessRow[]>`
                SELECT s."expiresAt", u.status::text AS status,
                    m."businessId", m.role::text AS role,
                    m.permissions::text[] AS permissions, m."readOnly"
                FROM "Session" s
                JOIN "User" u ON u.id = s."userId"
                LEFT JOIN LATERAL (
                    SELECT "businessId", role, permissions, "readOnly"
                    FROM "BusinessMembership"
                    WHERE "userId" = u.id AND "status" = 'ACTIVE'
                    ORDER BY ("businessId" = ${preferred}) DESC, "createdAt" ASC, "businessId" ASC LIMIT 1
                ) m ON true
                WHERE s."tokenHash" = ${tokenHash} LIMIT 1
            `;
            if (!access || access.status !== "ACTIVE" || access.expiresAt <= new Date()) {
                throw new OrderValidationError("გაიარე ავტორიზაცია.", 401);
            }
            if (!access.businessId || !access.role) {
                throw new OrderValidationError("ბიზნესი ვერ მოიძებნა.", 403);
            }

            return {
                reminder: await getCourierReminder(tx, access.businessId),
                canManage: canManageBusinessArea({ role: access.role, permissions: access.permissions ?? [],
                    readOnly: access.readOnly ?? true, status: "ACTIVE" }, "FINANCE"),
            };
        });
    } finally {
        await reader.$disconnect();
    }
}
