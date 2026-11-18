import { NextResponse } from "next/server";
import { apiAccessDenied } from "@/lib/business/access";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { InvoiceSettingsError, validateInvoiceSettings } from "@/lib/business/invoice-settings";
import { readInvoiceSettings } from "@/lib/business/invoice-settings-server";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// ინვოისის პარამეტრები: ნაგულისხმევი ზომა და ინვოისზე ნაჩვენები ნომერი.
async function patch(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const businessId = (await getPgDashboardContext())!.membership!.businessId;
    let input: ReturnType<typeof validateInvoiceSettings>;
    try {
        input = validateInvoiceSettings(await request.json().catch(() => null));
    } catch (cause) {
        if (cause instanceof InvoiceSettingsError) return json({ success: false, message: cause.message, field: cause.field }, 422);
        throw cause;
    }
    const db = createPrismaClient();
    try {
        // updatedAt არ იცვლება: ის ბიზნესის ძირითადი ფორმის ვერსიაა და აქ შენახვამ იქ კონფლიქტი არ უნდა გამოიწვიოს.
        await db.$executeRaw`
            UPDATE "Business"
            SET "invoicePaper" = ${input.paper}, "invoicePhoneMode" = ${input.phoneMode}, "invoicePhone" = ${input.customPhone}
            WHERE "id" = ${businessId}
        `;
        return json({ success: true, settings: await readInvoiceSettings(db, businessId) });
    } catch (error) {
        console.error("Invoice settings failed", error instanceof Error ? error.name : "UnknownError");
        return json({ success: false, message: "პარამეტრები ვერ შეინახა. სცადეთ ხელახლა.", field: "form" }, 500);
    } finally {
        await db.$disconnect();
    }
}
export const PATCH = guardMutation(patch);
