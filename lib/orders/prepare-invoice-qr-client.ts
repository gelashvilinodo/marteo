"use client";

import type { OrderInvoiceData } from "./invoice-types";

export async function prepareInvoiceQr(
    invoice: OrderInvoiceData,
    signal?: AbortSignal,
): Promise<OrderInvoiceData> {
    signal?.throwIfAborted();

    if (!invoice.publicUrl) return { ...invoice, qrDataUrl: null };
    if (invoice.qrDataUrl) return invoice;

    const { default: QRCode } = await import("qrcode");
    signal?.throwIfAborted();

    let qrDataUrl: string;
    try {
        qrDataUrl = await QRCode.toDataURL(invoice.publicUrl, {
            width: 320,
            margin: 4,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
        });
    } catch {
        throw new Error(
            "ინვოისის QR კოდის მომზადება ვერ მოხერხდა. სცადე ხელახლა.",
        );
    }

    signal?.throwIfAborted();
    return { ...invoice, qrDataUrl };
}
