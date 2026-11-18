export const INVOICE_PAPERS = ["a4", "80mm", "58mm", "100x150"] as const;

export type InvoicePaper = (typeof INVOICE_PAPERS)[number];

export function isInvoicePaper(value: unknown): value is InvoicePaper {
    return INVOICE_PAPERS.includes(value as InvoicePaper);
}
