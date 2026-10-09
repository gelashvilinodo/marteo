import Image from "next/image";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";

export type InvoicePaper =
    | "a4"
    | "80mm"
    | "58mm"
    | "100x150";

export function isInvoicePaper(value: unknown): value is InvoicePaper {
    return (
        value === "a4" ||
        value === "80mm" ||
        value === "58mm" ||
        value === "100x150"
    );
}
const statuses = { PROCESSING: "მუშავდება", SHIPPED: "გაგზავნილი", COMPLETED: "დასრულებული", RETURNED: "დაბრუნებული", CANCELED: "გაუქმებული" };
const payments = { PAID: "გადახდილი", UNPAID: "გადაუხდელი", PARTIALLY_PAID: "ნაწილობრივ გადახდილი", COURIER_ONLY_PAID: "მხოლოდ კურიერის საფასურია გადახდილი" };
function date(value: string) {
    const d = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

export default function InvoiceDocument({ invoice, paper = "a4" }: { invoice: OrderInvoiceData; paper?: InvoicePaper }) {
    const thermal = paper === "58mm" || paper === "80mm";
    return <article className="invoice-document" data-paper={paper}>
        <style>{`
            .invoice-document { color:#111; background:#fff; font-family:FiraGO,Arial,sans-serif; width:100%; font-size:12px; line-height:1.5; }
            .invoice-document * { box-sizing:border-box; }
            .invoice-document h2,.invoice-document h3,.invoice-document p { margin:0; }
            .invoice-document .invoice-top { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid #ccc; padding-bottom:14px; }
            .invoice-document .invoice-brand { display:flex; align-items:center; gap:12px; min-width:0; flex:1; }
            .invoice-document .invoice-brand h2 { font-size:18px; font-weight:600; overflow-wrap:anywhere; }
            .invoice-document .invoice-brand p { font-size:10px; color:#444; overflow-wrap:anywhere; }
            .invoice-document .invoice-heading { text-align:right; flex-shrink:0; }
            .invoice-document .invoice-heading h3 { font-weight:600; }
            .invoice-document .invoice-recipient { margin:16px 0; overflow-wrap:anywhere; }
            .invoice-document table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:inherit; }
            .invoice-document th { border-top:1px solid #bbb; border-bottom:1px solid #bbb; padding:7px 0; text-align:left; }
            .invoice-document td { border-bottom:1px solid #ddd; padding:9px 0; vertical-align:top; overflow-wrap:anywhere; }
            .invoice-document .invoice-item { font-weight:500; }
            .invoice-document .invoice-variant { font-size:10px; color:#444; margin-top:3px; }
            .invoice-document .invoice-right { text-align:right; font-variant-numeric:tabular-nums; }
            .invoice-document .invoice-bottom { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-top:18px; }
            .invoice-document .invoice-totals { width:100%; max-width:260px; margin-left:auto; }
            .invoice-document .invoice-totals div { display:flex; justify-content:space-between; gap:12px; margin:5px 0; }
            .invoice-document .invoice-grand-total { border-top:1px solid #bbb; padding-top:7px; font-size:15px; font-weight:600; }
            .invoice-document .invoice-qr { text-align:center; flex-shrink:0; }
            .invoice-document .invoice-qr img { width:32mm; height:32mm; }
            .invoice-document .invoice-qr p { font-size:10px; }
            .invoice-document .invoice-footer { margin-top:14px; text-align:center; font-size:10px; color:#444; }
            .invoice-document[data-paper="80mm"] { width:74mm; font-size:11px; }
            .invoice-document[data-paper="58mm"] { width:52mm; font-size:10px; }
            .invoice-document[data-paper="80mm"] .invoice-top,.invoice-document[data-paper="58mm"] .invoice-top { display:block; text-align:center; padding-bottom:8px; }
            .invoice-document[data-paper="80mm"] .invoice-brand,.invoice-document[data-paper="58mm"] .invoice-brand { display:block; }
            .invoice-document[data-paper="80mm"] .invoice-brand img,.invoice-document[data-paper="58mm"] .invoice-brand img { margin:0 auto 5px; width:32px; height:32px; }
            .invoice-document[data-paper="80mm"] .invoice-brand h2,.invoice-document[data-paper="58mm"] .invoice-brand h2 { font-size:14px; }
            .invoice-document[data-paper="80mm"] .invoice-heading,.invoice-document[data-paper="58mm"] .invoice-heading { text-align:center; margin-top:6px; }
            .invoice-document[data-paper="80mm"] .invoice-recipient,.invoice-document[data-paper="58mm"] .invoice-recipient { margin:10px 0; }
            .invoice-document .invoice-thermal-item { border-bottom:1px dashed #bbb; padding:7px 0; break-inside:avoid; }
            .invoice-document .invoice-thermal-line { display:flex; justify-content:space-between; gap:8px; margin-top:3px; font-variant-numeric:tabular-nums; }
            .invoice-document[data-paper="80mm"] .invoice-bottom,.invoice-document[data-paper="58mm"] .invoice-bottom { flex-direction:column-reverse; align-items:center; gap:10px; margin-top:10px; }
            .invoice-document[data-paper="80mm"] .invoice-totals,.invoice-document[data-paper="58mm"] .invoice-totals { max-width:none; }
            .invoice-document[data-paper="100x150"] {
    width:94mm;
    font-size:11px;
    line-height:1.4;
}

.invoice-document[data-paper="100x150"] .invoice-top {
    gap:8px;
    padding-bottom:8px;
}

.invoice-document[data-paper="100x150"] .invoice-brand {
    gap:6px;
}

.invoice-document[data-paper="100x150"] .invoice-brand img {
    width:32px;
    height:32px;
}

.invoice-document[data-paper="100x150"] .invoice-brand h2 {
    font-size:14px;
}

.invoice-document[data-paper="100x150"] .invoice-brand p {
    font-size:9px;
}

.invoice-document[data-paper="100x150"] .invoice-heading {
    font-size:10px;
}

.invoice-document[data-paper="100x150"] .invoice-recipient {
    margin:8px 0;
}

.invoice-document[data-paper="100x150"] th {
    padding:5px 0;
}

.invoice-document[data-paper="100x150"] td {
    padding:6px 0;
}

.invoice-document[data-paper="100x150"] .invoice-bottom {
    gap:8px;
    margin-top:10px;
}

.invoice-document[data-paper="100x150"] .invoice-qr img {
    width:24mm;
    height:24mm;
}

.invoice-document[data-paper="100x150"] .invoice-qr p {
    max-width:26mm;
    font-size:9px;
}

.invoice-document[data-paper="100x150"] .invoice-totals {
    min-width:0;
    max-width:60mm;
}

.invoice-document[data-paper="100x150"] .invoice-totals div {
    gap:6px;
    margin:3px 0;
}

.invoice-document[data-paper="100x150"] .invoice-grand-total {
    font-size:13px;
}

.invoice-document[data-paper="100x150"] .invoice-footer {
    margin-top:8px;
    font-size:9px;
}
            @media print {
                .invoice-document thead { display:table-header-group; }
                .invoice-document tr,.invoice-document .invoice-top,.invoice-document .invoice-recipient,.invoice-document .invoice-bottom { break-inside:avoid; }
            }
        `}</style>
        <header className="invoice-top">
            <div className="invoice-brand">
                {invoice.business.logoUrl && <Image src={invoice.business.logoUrl} alt="მაღაზიის ლოგო" width={56} height={56} unoptimized className="h-14 w-14 shrink-0 object-contain" />}
                <div><h2>{invoice.business.name}</h2><p>{[invoice.business.phone, invoice.business.email, invoice.business.address].filter(Boolean).join(" · ")}</p></div>
            </div>
            <div className="invoice-heading"><h3>ინვოისი{invoice.number !== null ? ` #${String(invoice.number).padStart(4, "0")}` : ""}</h3><p>{date(invoice.createdAt)}</p></div>
        </header>
        <div className="invoice-recipient"><p><strong>მიმღები:</strong> {invoice.recipient.name || "—"}</p><p>{invoice.recipient.phone}</p>{invoice.recipient.address && <p>{invoice.recipient.address}</p>}<p>{statuses[invoice.status]} · {payments[invoice.paymentStatus]}</p></div>
        {thermal ? <div>{invoice.items.map((item, index) => <div key={index} className="invoice-thermal-item"><p className="invoice-item">{item.name}</p><p className="invoice-variant">{[item.color, item.size, item.condition === "DEFECTIVE" ? "წუნდებული" : null].filter(Boolean).join(" · ")}</p><div className="invoice-thermal-line"><span>{item.quantity} × {item.unitPrice} ₾</span><strong>{item.total} ₾</strong></div></div>)}</div> :
            <table><thead><tr><th style={{ width: "46%" }}>პროდუქტი</th><th style={{ width: "12%" }}>რაოდ.</th><th className="invoice-right" style={{ width: "20%" }}>ფასი ₾</th><th className="invoice-right" style={{ width: "22%" }}>ჯამი ₾</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={index}><td><p className="invoice-item">{item.name}</p><p className="invoice-variant">{[item.color, item.size, item.condition === "DEFECTIVE" ? "წუნდებული" : null].filter(Boolean).join(" · ")}</p></td><td>{item.quantity}</td><td className="invoice-right">{item.unitPrice}</td><td className="invoice-right">{item.total}</td></tr>)}</tbody></table>}
        <div className="invoice-bottom">
            {invoice.qrDataUrl && <div className="invoice-qr"><Image src={invoice.qrDataUrl} alt="შეკვეთის გვერდის QR კოდი" width={128} height={128} unoptimized /><p>შეკვეთის დეტალების ნახვა</p></div>}
            <dl className="invoice-totals">
                {[
                    ["პროდუქტები", invoice.productsTotal],
                    ["მიწოდება", invoice.courierFee],
                    ["სულ", invoice.total],
                    ["გადახდილი", invoice.paidAmount],
                    ["დარჩენილი", invoice.remainingAmount],
                    ...(Number(invoice.refundDue) > 0
                        ? [["დასაბრუნებელი", invoice.refundDue]]
                        : []),
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className={
                            label === "სულ"
                                ? "invoice-grand-total"
                                : ""
                        }
                    >
                        <dt>{label}</dt>
                        <dd className="invoice-right">
                            {value} ₾
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
        <p className="invoice-footer">შექმნილია MARTEO-ს დახმარებით</p>
    </article>;
}
