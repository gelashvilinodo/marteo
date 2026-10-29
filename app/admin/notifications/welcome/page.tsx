import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getWelcomeTemplate } from "@/lib/notifications/admin";
import { WelcomeTemplateForm } from "@/components/admin/notifications/CampaignForm";

export default async function WelcomeTemplatePage() {
    const template = await getWelcomeTemplate().catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    return <>
        <Link href="/admin/notifications" prefetch={false} className="text-sm text-accent hover:underline">← შეტყობინებები</Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">მისალმების ტექსტი</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">ავტომატურად მიდის ყველა ახალ მომხმარებელთან პირველი შესვლისას. ცვლილება ეხება მხოლოდ მათ, ვინც ჯერ არ მიუღია.</p>
        <WelcomeTemplateForm initial={{ title: template?.title ?? "", body: template?.body ?? "", actionLabel: template?.actionLabel ?? "", actionUrl: template?.actionUrl ?? "" }} />
    </>;
}
