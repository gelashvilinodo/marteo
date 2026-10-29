import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { getConversationBusinessProfile, displayName } from "@/lib/support/support-chat";
import AdminConversation, { type BusinessProfile } from "@/components/admin/AdminConversation";

export const metadata = { title: "მიმოწერა · ადმინ პანელი" };

type Props = { params: Promise<{ conversationId: string }> };

export default async function AdminConversationPage({ params }: Props) {
    if (!await getAdminUser()) notFound();
    const { conversationId } = await params;
    const prisma = createPrismaClient();
    try {
        const conversation = await getConversationBusinessProfile(prisma, conversationId);
        if (!conversation) notFound();
        const { business } = conversation;
        const profile: BusinessProfile = {
            id: business.id,
            name: business.name,
            logoUrl: business.logoUrl,
            mode: business.mode,
            phone: business.phone,
            email: business.email,
            address: business.address,
            website: business.website,
            description: business.description,
            createdAt: business.createdAt.toISOString(),
            subscription: business.subscription
                ? { plan: business.subscription.plan, status: business.subscription.status, expiresAt: business.subscription.expiresAt?.toISOString() ?? null }
                : null,
            counts: { orders: business._count.orders, customers: business._count.customers, products: business._count.products },
            lastOrderAt: conversation.lastOrderAt?.toISOString() ?? null,
            members: business.memberships.map(member => ({
                id: member.user.id,
                role: member.role,
                name: displayName(member.user),
                email: member.user.email,
                phone: member.user.phone,
                avatarUrl: member.user.avatarUrl,
                joinedAt: member.user.createdAt.toISOString(),
            })),
        };
        return <AdminConversation conversationId={conversation.id} initialStatus={conversation.status} profile={profile} />;
    } finally { await prisma.$disconnect(); }
}
