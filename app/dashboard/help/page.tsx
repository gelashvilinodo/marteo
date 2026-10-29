import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/push/web-push";
import { displayName } from "@/lib/support/support-chat";
import HelpView from "@/components/dashboard/help/HelpView";

export const metadata = { title: "დახმარება · MARTEO" };

export default async function HelpPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const membership = await getCurrentBusiness();
    if (!membership) redirect("/business/onboarding");

    const prisma = createPrismaClient();
    try {
        const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
        return <HelpView
            business={{ name: membership.business.name, logoUrl: membership.business.logoUrl }}
            self={{ name: displayName(user), avatarUrl: profile?.avatarUrl ?? null }}
            firstName={user.firstName}
            pushKey={getVapidPublicKey()}
        />;
    } finally { await prisma.$disconnect(); }
}
