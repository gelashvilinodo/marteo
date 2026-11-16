import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";
import { consumeAdminCode } from "./two-factor";
import { deleteAccount, planAccountDeletion } from "@/lib/account/delete-account";

/** Admin deletes someone's account: typed e-mail + a fresh app code. Never the admin account itself. */
export async function adminDeleteUser(prisma: PrismaClient, adminId: string, userId: unknown, input: { confirmEmail?: unknown; code?: unknown }, request: Request) {
    if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new AdminActionError("მომხმარებელი ვერ მოიძებნა.", 404);
    const plan = await planAccountDeletion(prisma, userId);
    if (!plan) throw new AdminActionError("მომხმარებელი ვერ მოიძებნა.", 404);
    if (plan.isPlatformAdmin || plan.userId === adminId) throw new AdminActionError("ადმინის ანგარიშის წაშლა აქედან შეუძლებელია.", 403);
    const typed = typeof input.confirmEmail === "string" ? input.confirmEmail.trim().toLowerCase() : "";
    if (typed !== plan.email.toLowerCase()) throw new AdminActionError("დასადასტურებლად ზუსტად აკრიფეთ მომხმარებლის ელფოსტა.");
    await consumeAdminCode(prisma, adminId, input.code, request);
    await deleteAccount(prisma, userId, { goodbyeEmail: true });
    const deleted = plan.businesses.filter(business => business.fate === "delete");
    // ისტორიაში პირადი მონაცემები (სახელი, ელფოსტა) აღარ ინახება, მხოლოდ რა მოხდა.
    await prisma.adminAuditLog.create({
        data: {
            adminId, action: "user-delete", targetType: "USER", targetId: userId,
            after: { businessesDeleted: deleted.map(business => business.name), businessesLeft: plan.businesses.length - deleted.length },
        },
    });
    return deleted.length
        ? `ანგარიში წაიშალა. წაიშალა ${deleted.length} ბიზნესიც: ${deleted.map(business => `„${business.name}“`).join(", ")}.`
        : "ანგარიში წაიშალა.";
}
