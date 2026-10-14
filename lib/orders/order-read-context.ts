import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { orderJson, orderError } from "./order-http";

export async function withOrderReadContext(
    read: (client: ReturnType<typeof createPrismaClient>, businessId: string) => Promise<Response>,
) {
    let client: ReturnType<typeof createPrismaClient> | undefined;
    const getClient = () => (client ??= createPrismaClient());
    try {
        const user = await getCurrentUserWithClient(getClient);
        if (!user) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        const membership = await getClient().businessMembership.findFirst({
            where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { businessId: true },
        });
        if (!membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        return await read(getClient(), membership.businessId);
    } catch (cause) {
        return orderError(cause);
    } finally {
        if (client) await client.$disconnect();
    }
}
