import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { getConversationBusinessProfile, displayName } from "@/lib/support/support-chat";
import AdminConversation, { type BusinessProfile } from "@/components/admin/AdminConversation";
import { listNotes } from "@/lib/admin/support-tools";
import { getAuditLog } from "@/lib/admin/actions";
import { getBusinessAi } from "@/lib/admin/ai-usage";
import { listPayments } from "@/lib/admin/payments";
import { getBusinessRiskSignals } from "@/lib/admin/risk-signals";

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
        const [notes, history, payments, ai, risk] = await Promise.all([
            listNotes(prisma, business.id), getAuditLog(prisma, "BUSINESS", business.id), listPayments(prisma, business.id),
            getBusinessAi(prisma, business.id), getBusinessRiskSignals(business.id),
        ]);
        const paid = payments.filter(payment => !payment.voidedAt);
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
            account: {
                plan: risk?.plan ?? "FREE",
                signals: risk?.signals ?? [],
                ai: { used: ai.used, limit: ai.limit, disabled: ai.disabled, custom: ai.custom, monthCost: ai.monthCost },
                lastPayment: paid[0] ? { plan: paid[0].plan, amount: paid[0].amount, method: paid[0].method, months: paid[0].months, paidAt: paid[0].paidAt, periodEnd: paid[0].periodEnd } : null,
                paidTotal: paid.reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2),
                payments: paid.length,
            },
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
        return <AdminConversation conversationId={conversation.id} initialStatus={conversation.status} profile={profile} notes={notes} history={history.slice(0, 5)} />;
    } finally { await prisma.$disconnect(); }
}
