import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import { listTemplates } from "@/lib/admin/support-tools";
import { createPrismaClient } from "@/lib/prisma";
import { BackLink } from "@/components/admin/AdminDetail";
import TemplatesManager from "@/components/admin/TemplatesManager";

export const metadata = { title: "სწრაფი პასუხები · ადმინ პანელი" };

export default async function SupportTemplatesPage() {
    if (!await getAdminUser()) notFound();
    const prisma = createPrismaClient();
    try {
        const templates = await listTemplates(prisma);
        return <div className="mx-auto max-w-3xl">
            <BackLink href="/admin/support" label="დახმარება" />
            <h1 className="mt-3 text-2xl font-semibold text-text-primary">სწრაფი პასუხები</h1>
            <p className="mt-1 text-sm text-text-secondary">ჩათში ⚡ ღილაკით ჩასმადი ტექსტები. <code className="rounded bg-surface px-1">{"{name}"}</code> შეიცვლება მომხმარებლის სახელით.</p>
            <TemplatesManager initial={templates} />
        </div>;
    } finally { await prisma.$disconnect(); }
}
