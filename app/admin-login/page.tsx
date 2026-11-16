import { notFound, redirect } from "next/navigation";
import { adminMetadata } from "@/lib/admin/metadata";
import { getAdminCandidate, getAdminDevice } from "@/lib/admin/authorization";
import { getTwoFactorState } from "@/lib/admin/two-factor";
import AdminTwoFactorLogin from "@/components/admin/AdminTwoFactorLogin";
import { createPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export function generateMetadata() {
    return adminMetadata("ადმინ პანელი · მეორე ნაბიჯი", { robots: { index: false, follow: false } });
}

// ადმინ პანელის მეორე ნაბიჯი: ჯერ ჩართვა (QR), შემდეგ ყოველ ახალ მოწყობილობაზე კოდი.
export default async function AdminLoginPage() {
    const admin = await getAdminCandidate();
    if (!admin) notFound();
    if (await getAdminDevice(admin.id)) redirect("/admin");
    const prisma = createPrismaClient();
    const state = await getTwoFactorState(prisma, admin.id).finally(() => prisma.$disconnect());
    return <AdminTwoFactorLogin mode={state.enabled ? "verify" : "setup"} email={admin.email} />;
}
