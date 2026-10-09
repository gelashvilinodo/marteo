import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import InvoiceBatchPrintPage from "@/components/dashboard/orders/InvoiceBatchPrintPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "ინვოისების ბეჭდვა", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string | string[]; mode?: string; selection?: string }> }) {
    if (!await getCurrentUser()) redirect("/login");
    const params = await searchParams;
    if (params.mode === "new" || params.mode === "pending") return <InvoiceBatchPrintPage mode={params.mode} />;
    if (typeof params.selection === "string" && params.selection) return <InvoiceBatchPrintPage selectionKey={params.selection} />;
    const raw = typeof params.ids === "string" ? params.ids : "";
    const ids = [...new Set(raw.split(",").filter(id => /^[a-zA-Z0-9_-]+$/.test(id)))];
    if (!ids.length) return <main className="p-6">მონიშნე შეკვეთები და გახსენი ბეჭდვა. <a href="/dashboard/orders">შეკვეთებზე დაბრუნება</a></main>;
    return <InvoiceBatchPrintPage key={ids.join(",")} ids={ids} />;
}
