import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getCampaign } from "@/lib/notifications/admin";
import CampaignForm from "@/components/admin/notifications/CampaignForm";

// datetime-local value in Tbilisi time (UTC+4, no DST).
const toTbilisiInput = (date: Date) => new Date(date.getTime() + 4 * 3600000).toISOString().slice(0, 16);

export default async function EditAdminNotificationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const campaign = await getCampaign(id).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    // Delivered or canceled campaigns are history: no editing.
    if (!campaign || campaign.canceledAt || campaign.deliverAt <= new Date()) notFound();
    return <>
        <Link href="/admin/notifications" prefetch={false} className="text-sm text-accent hover:underline">← შეტყობინებები</Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">დაგეგმილი შეტყობინების რედაქტირება</h1>
        <CampaignForm id={campaign.id} initial={{
            title: campaign.title, body: campaign.body, actionLabel: campaign.actionLabel ?? "", actionUrl: campaign.actionUrl ?? "",
            modes: campaign.modes, plan: campaign.plan, registeredWithinDays: campaign.registeredWithinDays?.toString() ?? "",
            deliverAt: toTbilisiInput(campaign.deliverAt),
        }} />
    </>;
}
