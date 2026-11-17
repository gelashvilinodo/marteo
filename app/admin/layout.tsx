import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getAdminCandidate, getAdminUser } from "@/lib/admin/authorization";
import AdminShell from "@/components/admin/AdminShell";
import PushSync from "@/components/support/PushSync";
import { getVapidPublicKey } from "@/lib/push/web-push";
import { isPlatformOwner } from "@/lib/admin/admin-team";
import { createPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const admin = await getAdminUser();
    if (!admin) {
        // ადმინია, მაგრამ ამ მოწყობილობაზე კოდი ჯერ არ შეუყვანია.
        if (await getAdminCandidate()) redirect("/admin-login");
        notFound();
    }
    const adminName = [admin.firstName, admin.lastName].filter(Boolean).join(" ");
    const prisma = createPrismaClient();
    const isOwner = await isPlatformOwner(prisma, admin.id).finally(() => prisma.$disconnect());
    return <AdminShell adminName={adminName} adminEmail={admin.email} isOwner={isOwner}><PushSync publicKey={getVapidPublicKey()} />{children}</AdminShell>;
}
