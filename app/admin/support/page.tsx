import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/push/web-push";
import { listAdminConversations } from "@/lib/support/support-chat";
import AdminSupportInbox from "@/components/admin/AdminSupportInbox";

export const metadata = { title: "დახმარება · ადმინ პანელი" };

export default async function AdminSupportPage() {
    if (!await getAdminUser()) notFound();
    const prisma = createPrismaClient();
    try {
        const initial = await listAdminConversations(prisma);
        return <AdminSupportInbox initial={initial} pushKey={getVapidPublicKey()} />;
    } finally { await prisma.$disconnect(); }
}
