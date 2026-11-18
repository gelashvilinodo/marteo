import { isInvoicePaper, type InvoicePaper } from "@/lib/orders/invoice-paper";

export type InvoicePhoneMode = "ACCOUNT" | "CUSTOM" | "OFF";

export type InvoiceSettings = {
    paper: InvoicePaper;
    phoneMode: InvoicePhoneMode;
    customPhone: string | null;
    // რეგისტრაციისას მითითებული ნომერი (მფლობელის ანგარიშიდან), მხოლოდ საჩვენებლად.
    accountPhone: string | null;
};

export function isInvoicePhoneMode(value: unknown): value is InvoicePhoneMode {
    return value === "ACCOUNT" || value === "CUSTOM" || value === "OFF";
}

export class InvoiceSettingsError extends Error {
    constructor(message: string, public field: "paper" | "phone" | "form" = "form") {
        super(message);
        this.name = "InvoiceSettingsError";
    }
}

function readPhone(value: unknown): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new InvoiceSettingsError("მიუთითეთ ნომერი, რომელიც ინვოისზე გამოჩნდება.", "phone");
    const compact = text.replace(/[\s()\-]/g, "").replace(/^00/, "+");
    const normalized = /^\d{9}$/.test(compact) ? `+995${compact}` : compact;
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new InvoiceSettingsError("მიუთითეთ 9-ციფრიანი ქართული ნომერი ან საერთაშორისო ნომერი ქვეყნის კოდით, მაგალითად +995…", "phone");
    }
    return normalized;
}

export function validateInvoiceSettings(value: unknown): { paper: InvoicePaper; phoneMode: InvoicePhoneMode; customPhone: string | null } {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoiceSettingsError("მონაცემების ფორმატი არასწორია.");
    const input = value as Record<string, unknown>;
    if (!isInvoicePaper(input.paper)) throw new InvoiceSettingsError("აირჩიეთ ინვოისის ზომა.", "paper");
    if (!isInvoicePhoneMode(input.phoneMode)) throw new InvoiceSettingsError("აირჩიეთ, რომელი ნომერი გამოჩნდეს ინვოისზე.", "phone");
    // სხვა ნომერი ინახება მაშინაც, როცა სხვა ვარიანტია არჩეული, რომ დაბრუნებისას თავიდან აკრეფა არ დასჭირდეს.
    const customPhone = input.phoneMode === "CUSTOM"
        ? readPhone(input.customPhone)
        : typeof input.customPhone === "string" && input.customPhone.trim()
            ? (() => { try { return readPhone(input.customPhone); } catch { return null; } })()
            : null;
    return { paper: input.paper, phoneMode: input.phoneMode, customPhone };
}
