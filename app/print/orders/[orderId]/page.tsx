import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import InvoicePrintPage from "@/components/dashboard/orders/InvoicePrintPage";
import { isInvoicePaper } from "@/components/dashboard/orders/InvoiceDocument";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "ინვოისის ბეჭდვა | MARTEO",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};
export default async function PrintOrderPage({ params, searchParams }: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<{ format?: string | string[] }>;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const { orderId } = await params;
    const { format } = await searchParams;
    const paper = isInvoicePaper(format) ? format : "a4";
    return <InvoicePrintPage key={`${orderId}-${paper}`} orderId={orderId} initialPaper={paper} />;
}
