import { requirePageAccess } from "@/lib/business/access";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import InvoicePrintPage from "@/components/dashboard/orders/InvoicePrintPage";
import { isInvoicePaper } from "@/lib/orders/invoice-paper";
import { createPrismaClient } from "@/lib/prisma";

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
    const membership = await requirePageAccess("ORDERS");
    const { orderId } = await params;
    const { format } = await searchParams;
    const paper = isInvoicePaper(format) ? format : await defaultPaper(membership.businessId);
    return <InvoicePrintPage key={`${orderId}-${paper}`} orderId={orderId} initialPaper={paper} />;
}


// ბმული ფორმატის გარეშე იხსნება ბიზნესის პარამეტრებში არჩეული ზომით.
async function defaultPaper(businessId: string) {
    const prisma = createPrismaClient();
    try {
        const business = await prisma.business.findUnique({ where: { id: businessId }, select: { invoicePaper: true } });
        return isInvoicePaper(business?.invoicePaper) ? business.invoicePaper : "a4";
    } finally {
        await prisma.$disconnect();
    }
}
