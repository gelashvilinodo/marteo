import "server-only";
import type { createPrismaClient } from "@/lib/prisma";
import { deleteBusinessOfLeavingOwner, leaveBusiness } from "@/lib/business/team-manage";
import { deleteSavedCard } from "@/lib/payments/bog";
import { accountEmailHash, accountPhoneHash } from "./deleted-accounts";
import { sendGoodbyeEmail } from "./goodbye-email";

type Db = ReturnType<typeof createPrismaClient>;

export type BusinessFate = { id: string; name: string; role: "OWNER" | "MEMBER"; fate: "delete" | "leave"; otherMembers: number };
export type AccountDeletionPlan = { userId: string; email: string; name: string; isPlatformAdmin: boolean; businesses: BusinessFate[] };
type PlanWithPrivate = AccountDeletionPlan & { phone: string; firstName: string | null; trialUsed: boolean };

/**
 * What deleting this account would do to each business: staff and co-owners leave (the business stays),
 * a business with no other active owner is deleted together with its data and its team.
 */
export async function planAccountDeletion(db: Db, userId: string): Promise<AccountDeletionPlan | null> {
    const plan = await readPlan(db, userId);
    if (!plan) return null;
    const { userId: id, email, name, isPlatformAdmin, businesses } = plan;
    return { userId: id, email, name, isPlatformAdmin, businesses };
}

async function readPlan(db: Db, userId: string): Promise<PlanWithPrivate | null> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            id: true, email: true, phone: true, firstName: true, lastName: true, isPlatformAdmin: true, trialUsedAt: true,
            memberships: {
                orderBy: { createdAt: "asc" },
                select: {
                    role: true,
                    business: {
                        select: {
                            id: true, name: true,
                            memberships: { select: { userId: true, role: true, status: true } },
                        },
                    },
                },
            },
        },
    });
    if (!user) return null;
    return {
        userId: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin,
        phone: user.phone, firstName: user.firstName, trialUsed: Boolean(user.trialUsedAt),
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        businesses: user.memberships.map(({ role, business }) => {
            const others = business.memberships.filter(member => member.userId !== user.id);
            const otherOwner = others.some(member => member.role === "OWNER" && member.status === "ACTIVE");
            return {
                id: business.id, name: business.name, role: role === "OWNER" ? "OWNER" : "MEMBER",
                fate: role === "OWNER" && !otherOwner ? "delete" : "leave",
                otherMembers: others.length,
            };
        }),
    };
}

/**
 * Deletes the account. Each business step is its own transaction and safe to repeat, so a failure midway
 * can simply be retried; the user row goes last (sessions, notifications, devices go with it).
 */
export async function deleteAccount(db: Db, userId: string, options: { goodbyeEmail?: boolean } = {}) {
    const plan = await readPlan(db, userId);
    if (!plan) return null;
    if (plan.isPlatformAdmin) throw new Error("Platform admin account cannot be deleted here");
    const cards: string[] = [];
    for (const business of plan.businesses) {
        if (business.fate === "delete") {
            const removed = await deleteBusinessOfLeavingOwner(db, business.id, userId);
            if (removed.bankCardOrderId) cards.push(removed.bankCardOrderId);
        } else {
            await leaveBusiness(db, business.id, userId);
        }
    }
    await db.$transaction([
        // ელფოსტის ჟურნალში მისამართი რჩებოდა: ანგარიშთან ერთად ისიც იშლება.
        db.emailLog.deleteMany({ where: { recipient: plan.email.toLowerCase() } }),
        // საცდელი უკვე გამოიყენა: ხელახალ რეგისტრაციას ახალი აღარ ეკუთვნის (მხოლოდ ჰეშები).
        ...plan.trialUsed ? [db.deletedAccount.create({ data: { emailHash: accountEmailHash(plan.email), phoneHash: accountPhoneHash(plan.phone) } })] : [],
        db.user.delete({ where: { id: userId } }),
    ]);
    // შენახული ბარათი ბანკშიც იშლება, რომ არაფერი ჩამოიჭრას.
    for (const card of cards) await deleteSavedCard(card).catch(() => console.error("BOG card delete after account deletion failed"));
    if (options.goodbyeEmail) {
        await sendGoodbyeEmail(plan.email, plan.firstName, plan.businesses.filter(business => business.fate === "delete").map(business => business.name))
            .catch(() => console.error("Goodbye email failed"));
    }
    const { userId: id, email, name, isPlatformAdmin, businesses } = plan;
    return { userId: id, email, name, isPlatformAdmin, businesses } satisfies AccountDeletionPlan;
}
