import type { OrderEntry } from "@/lib/orders/get-orders-page";

// შეკვეთის სტატუსები და ფორმატი — გვერდზე, დეტალებში და მართეო AI-ის ბარათებზე.
export const statuses = {
    PROCESSING: { label: "მუშავდება", icon: "solar:clock-circle-linear", tone: "text-warning bg-warning/10" },
    SHIPPED: {
        label: "გაგზავნილი",
        icon: "solar:delivery-linear",
        tone: "text-accent bg-accent/10",
    },
    COMPLETED: { label: "დასრულებული", icon: "solar:check-circle-linear", tone: "text-success bg-success/10" },
    CANCELED: { label: "გაუქმებული", icon: "solar:close-circle-linear", tone: "text-danger bg-danger/10" },
    RETURNED: {
        label: "დაბრუნებული",
        icon: "solar:undo-left-round-linear",
        tone: "text-accent bg-accent/10",
    },
};
export const payments = {
    UNKNOWN: "გადახდა დაუზუსტებელია",
    PAID: "გადახდილი",
    UNPAID: "გადასახდელი",
    PARTIALLY_PAID: "ნაწილობრივ",
    COURIER_ONLY_PAID: "მხოლოდ კურიერი",
};
export const methods = {
    CASH: "ნაღდი",
    BANK_TRANSFER: "გადარიცხვა",
    CARD: "ბარათი",
    UNKNOWN: "მეთოდი უცნობია",
};

export function number(value: Pick<OrderEntry, "id" | "number">) {
    return value.number !== null ? `#${String(value.number).padStart(4, "0")}` : `#${value.id.slice(-6)}`;
}
export function recipient(value: OrderEntry) {
    return [value.recipientFirstName, value.recipientLastName].filter(Boolean).join(" ") || "მიმღები";
}
export function date(value: string) {
    const d = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
