import { Decimal } from "@prisma/client-runtime-utils";
import { validQuantity } from "./quantity";
export type InventoryOrderProduct = {
    source?: "INVENTORY" | "MATERIAL"; unit?: string; unitCost?: string; materialLots?: Array<{remainingQuantity:string;defectiveQuantity:string;remainingCost:string}>;
    id: string; sku: string; name: string; brand: string; category: string; description: string;
    color: string; size: string; imageUrl: string | null; salePrice: string | null;
    totalStock: number; goodStock: number; defectiveStock: number;
};
export type OrderFormItem = {
    displayNumber?: number;
    orderItemId?: string;
    isCarriedOver?: boolean;
    key: string; source: "MANUAL" | "INVENTORY" | "MATERIAL"; inventoryItemId: string | null; materialId?:string|null; unit?:string; materialLots?:InventoryOrderProduct["materialLots"];
    name: string; description: string; color: string; size: string; imageUrl: string | null;
    condition: "GOOD" | "DEFECTIVE"; quantity: string; unitPrice: string; unitCost: string;
    goodStock?: number; defectiveStock?: number;
    materialCostSnapshot?:{quantity:string;totalCost:string};
    uploadPending?: boolean;
};
export type OrderFormDraft = {
    recipientPhone: string; recipientFirstName: string; recipientLastName: string; shippingAddress: string; notes: string;
    courierFee: string; paidAmount: string; paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD" | "UNKNOWN";
    bankName: string; status: "PROCESSING" | "COMPLETED"; items: OrderFormItem[];
};
export type PaidMode = "none" | "full" | "courier" | "custom";
export function emptyOrderDraft(): OrderFormDraft {
    return { recipientPhone: "", recipientFirstName: "", recipientLastName: "", shippingAddress: "", notes: "", courierFee: "0", paidAmount: "0", paymentMethod: "CASH", bankName: "", status: "PROCESSING", items: [] };
}
export function manualOrderItem(): OrderFormItem {
    return { key: crypto.randomUUID(), source: "MANUAL", inventoryItemId: null, name: "", description: "", color: "", size: "", imageUrl: null, condition: "GOOD", quantity: "1", unitPrice: "", unitCost: "" };
}
export function inventoryOrderItem(product: InventoryOrderProduct, condition: "GOOD" | "DEFECTIVE"): OrderFormItem {
    return {
        ...manualOrderItem(), source: product.source === "MATERIAL" ? "MATERIAL" : "INVENTORY", inventoryItemId: product.source === "MATERIAL" ? null : product.id, materialId:product.source === "MATERIAL"?product.id:null, unit:product.unit??"PCS",materialLots:product.materialLots,quantity:String(Math.min(1,product.goodStock)), name: product.name, description: product.description,
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
export function orderLineCents(item:Pick<OrderFormItem,'unitPrice'|'quantity'>):bigint|null{
    const price=moneyCents(item.unitPrice),q=item.quantity.trim().replace(',','.');
    if(price===null||!/^\d+(?:\.\d{1,6})?$/.test(q))return null;
    return BigInt(new Decimal(price.toString()).mul(q).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed(0));
}
export function orderFormTotals(draft: OrderFormDraft, paidMode: PaidMode) {
    const products = draft.items.reduce((total, item) => {
        return total+(orderLineCents(item)??0n);
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
        if (!/^\d+(?:[.,]\d{1,6})?$/.test(item.quantity) || !validQuantity(Number(item.quantity.replace(",","."))) || Number(item.quantity.replace(",",".")) <= 0 || ((item.source!=="MATERIAL"||item.unit==="PCS")&&!Number.isSafeInteger(Number(item.quantity)))) throw new Error(item.source==="MATERIAL"&&item.unit!=="PCS"?`${label}: მიუთითე დადებითი რაოდენობა, მაქსიმუმ 6 ათწილადით.`:`${label}: რაოდენობა უნდა იყოს დადებითი მთელი რიცხვი.`);
        if (moneyCents(item.unitPrice) === null) throw new Error(`${label}: მიუთითე გასაყიდი ფასი. უფასოდ გაცემისთვის ჩაწერე 0.`);
        if (
            item.source !== "MATERIAL" && item.unitCost.trim() !== "" &&
            moneyCents(item.unitCost) === null
        ) {
            throw new Error(
                `${label}: თვითღირებულება მიუთითე თეთრების სიზუსტით ან დატოვე ცარიელი.`,
            );
        }
        return {
            orderItemId: item.orderItemId,
            source: item.source,
            inventoryItemId: item.inventoryItemId, materialId:item.materialId??null,unit:item.unit??"PCS",
            condition: item.condition,
            name: item.name,
            imageUrl:
                item.source === "MANUAL"
                    ? item.imageUrl
                    : null,
            description: item.description,
            color: item.color,
            size: item.size,
            quantity: Number(item.quantity.replace(",",".")), unitPrice: item.unitPrice.trim().replace(",", "."), unitCost: item.source==="MATERIAL"?"":item.unitCost.trim().replace(",", ".")
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
        recipientLastName: draft.recipientLastName, shippingAddress: draft.shippingAddress, notes: draft.notes, status: "PROCESSING" as const,
        confirmCompleted: false, courierFee: moneyText(totals.courier), paidAmount: moneyText(totals.paid), paymentMethod: draft.paymentMethod,
        bankName: draft.bankName, items
    };
}
export type OrderCreatePayload = ReturnType<typeof orderCreatePayload>;

export function matchesStockItem(item:OrderFormItem,product:InventoryOrderProduct){return product.source==='MATERIAL'?item.source==='MATERIAL'&&item.materialId===product.id:item.inventoryItemId===product.id;}
export function incrementStockQuantity(item:OrderFormItem,product:InventoryOrderProduct,condition:'GOOD'|'DEFECTIVE'){
    const current=new Decimal(item.quantity.replace(',','.')||0),stock=new Decimal(condition==='GOOD'?product.goodStock:product.defectiveStock);
    return current.plus(Decimal.min(1,Decimal.max(stock.minus(current),0))).toString();
}
