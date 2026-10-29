import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const admin = await getAdminUser();
    if (!admin) notFound();
    const adminName = [admin.firstName, admin.lastName].filter(Boolean).join(" ");
    return <AdminShell adminName={adminName} adminEmail={admin.email}>{children}</AdminShell>;
}
