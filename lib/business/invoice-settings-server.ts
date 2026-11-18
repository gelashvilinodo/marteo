import "server-only";
import type { createPrismaClient } from "@/lib/prisma";
import { isInvoicePaper } from "@/lib/orders/invoice-paper";
import { isInvoicePhoneMode, type InvoiceSettings } from "./invoice-settings";

type Db = Pick<ReturnType<typeof createPrismaClient>, "business" | "businessMembership">;

// რეგისტრაციის ნომერი იგივე წესით, რაც ინვოისის მოთხოვნაში: პირველი აქტიური მფლობელი.
export async function readInvoiceSettings(db: Db, businessId: string): Promise<InvoiceSettings> {
    const [business, owner] = await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { invoicePaper: true, invoicePhoneMode: true, invoicePhone: true } }),
        db.businessMembership.findFirst({
            where: { businessId, role: "OWNER", status: "ACTIVE" },
            orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
            select: { user: { select: { phone: true } } },
        }),
    ]);
    return {
        paper: isInvoicePaper(business?.invoicePaper) ? business.invoicePaper : "a4",
        phoneMode: isInvoicePhoneMode(business?.invoicePhoneMode) ? business.invoicePhoneMode : "ACCOUNT",
        customPhone: business?.invoicePhone ?? null,
        accountPhone: owner?.user.phone ?? null,
    };
}
