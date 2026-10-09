export type InventoryOrderProduct = {
    id: string; sku: string; name: string; brand: string; category: string; description: string;
    color: string; size: string; imageUrl: string | null; salePrice: string | null;
    totalStock: number; goodStock: number; defectiveStock: number;
};
export type OrderFormItem = {
    displayNumber?: number;
    orderItemId?: string;
    isCarriedOver?: boolean;
    key: string; source: "MANUAL" | "INVENTORY"; inventoryItemId: string | null;
    name: string; description: string; color: string; size: string; imageUrl: string | null;
    condition: "GOOD" | "DEFECTIVE"; quantity: string; unitPrice: string; unitCost: string;
    goodStock?: number; defectiveStock?: number;
    uploadPending?: boolean;
};
export type OrderFormDraft = {
    recipientPhone: string; recipientFirstName: string; recipientLastName: string; shippingAddress: string;
    courierFee: string; paidAmount: string; paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD";
    bankName: string; status: "PROCESSING" | "COMPLETED"; items: OrderFormItem[];
};
export type PaidMode = "none" | "full" | "courier" | "custom";
export function emptyOrderDraft(): OrderFormDraft {
    return { recipientPhone: "", recipientFirstName: "", recipientLastName: "", shippingAddress: "", courierFee: "0", paidAmount: "0", paymentMethod: "CASH", bankName: "", status: "PROCESSING", items: [] };
}
export function manualOrderItem(): OrderFormItem {
    return { key: crypto.randomUUID(), source: "MANUAL", inventoryItemId: null, name: "", description: "", color: "", size: "", imageUrl: null, condition: "GOOD", quantity: "1", unitPrice: "", unitCost: "0" };
}
export function inventoryOrderItem(product: InventoryOrderProduct, condition: "GOOD" | "DEFECTIVE"): OrderFormItem {
    return {
        ...manualOrderItem(), source: "INVENTORY", inventoryItemId: product.id, name: product.name, description: product.description,
        color: product.color, size: product.size, imageUrl: product.imageUrl, condition, unitPrice: product.salePrice ?? "", goodStock: product.goodStock, defectiveStock: product.defectiveStock
    };
}
export function moneyCents(value: string): bigint | null {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, decimal = ""] = normalized.split(".");
    return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}
export function moneyText(cents: bigint): string {
    const negative = cents < 0n; const amount = negative ? -cents : cents;
    return `${negative ? "-" : ""}${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
export function orderFormTotals(draft: OrderFormDraft, paidMode: PaidMode) {
    const products = draft.items.reduce((total, item) => {
        const price = moneyCents(item.unitPrice);
        return price !== null && /^\d+$/.test(item.quantity) ? total + price * BigInt(item.quantity) : total;
    }, 0n);
    const courier = moneyCents(draft.courierFee) ?? 0n;
    const total = products + courier;
    const paid = paidMode === "full" ? total : paidMode === "courier" ? courier : paidMode === "custom" ? moneyCents(draft.paidAmount) ?? 0n : 0n;
    return { products, courier, total, paid, remaining: total - paid };
}
export function lookupPhone(value: string): string | null {
    if (!/^\+?[\d\s()-]+$/.test(value.trim())) return null;
    let digits = value.replace(/\D/g, "").replace(/^00/, "");
    if (/^5\d{8}$/.test(digits)) digits = `995${digits}`;
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
export function orderCreatePayload(
    draft: OrderFormDraft,
    paidMode: PaidMode,
    clientRequestId: string,
    mode: "create" | "edit" = "create",
) {
    if (!lookupPhone(draft.recipientPhone)) throw new Error("მიუთითე სწორი ტელეფონის ნომერი.");
    if (!draft.items.length) throw new Error("შეკვეთაში დაამატე პროდუქტი.");
    if (draft.items.some(item => item.uploadPending)) {
        throw new Error(
            "ფოტო ჯერ იტვირთება. დაელოდე ატვირთვის დასრულებას.",
        );
    }
    const items = draft.items.map((item, index) => {
        const label = `პროდუქტი ${index + 1}`;
        if (!item.name.trim()) throw new Error(`${label}: მიუთითე სახელი.`);
        if (!/^\d+$/.test(item.quantity) || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw new Error(`${label}: რაოდენობა უნდა იყოს დადებითი მთელი რიცხვი.`);
        if (moneyCents(item.unitPrice) === null) throw new Error(`${label}: მიუთითე გასაყიდი ფასი. უფასოდ გაცემისთვის ჩაწერე 0.`);
        if (item.source === "MANUAL" && moneyCents(item.unitCost) === null) throw new Error(`${label}: მიუთითე თვითღირებულება.`);
        return {
            orderItemId: item.orderItemId,
            source: item.source,
            inventoryItemId: item.inventoryItemId,
            condition: item.condition,
            name: item.name,
            imageUrl:
                item.source === "MANUAL"
                    ? item.imageUrl
                    : null,
            description: item.description,
            color: item.color,
            size: item.size,
            quantity: Number(item.quantity), unitPrice: item.unitPrice.trim().replace(",", "."), unitCost: item.unitCost.trim().replace(",", ".")
        };
    });
    if (moneyCents(draft.courierFee) === null) throw new Error("მიუთითე კურიერის საფასური.");
    if (paidMode === "custom" && moneyCents(draft.paidAmount) === null) throw new Error("მიუთითე გადახდილი თანხა.");
    const totals = orderFormTotals(draft, paidMode);
    if (mode === "create" && totals.paid > totals.total) {
        throw new Error("გადახდილი თანხა შეკვეთის ჯამს აღემატება.");
    }
    return {
        clientRequestId, recipientPhone: draft.recipientPhone, recipientFirstName: draft.recipientFirstName,
        recipientLastName: draft.recipientLastName, shippingAddress: draft.shippingAddress, status: "PROCESSING" as const,
        confirmCompleted: false, courierFee: moneyText(totals.courier), paidAmount: moneyText(totals.paid), paymentMethod: draft.paymentMethod,
        bankName: draft.bankName, items
    };
}
export type OrderCreatePayload = ReturnType<typeof orderCreatePayload>;
