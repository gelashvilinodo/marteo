import Link from "next/link";
import CampaignForm from "@/components/admin/notifications/CampaignForm";

export default function NewAdminNotificationPage() {
    return <>
        <Link href="/admin/notifications" prefetch={false} className="text-sm text-accent hover:underline">← შეტყობინებები</Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">ახალი შეტყობინება</h1>
        <CampaignForm initial={{ title: "", body: "", actionLabel: "", actionUrl: "", modes: [], plan: "ALL", registeredWithinDays: "", deliverAt: "" }} />
    </>;
}
