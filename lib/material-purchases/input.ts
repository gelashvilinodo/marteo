import { Prisma } from "@/generated/prisma/browser";
export const UNITS = [
    ["PCS", "ცალი"], ["KG", "კგ"], ["G", "გ"], ["L", "ლიტრი"], ["ML", "მლ"],
    ["M", "მეტრი"], ["CM", "სმ"], ["MM", "მმ"], ["M2", "მ²"], ["M3", "მ³"],
] as const;
export class MaterialError extends Error {
    constructor(message: string, readonly status = 422) { super(message); }
}
export function text(value: unknown, max: number, required = false): string {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new MaterialError("შეავსე ველები სწორად; ტექსტი ცარიელია ან ძალიან გრძელია.");
    return value.trim();
}
function decimal(value: unknown, scale: number, label: string, positive = false) {
    const s = typeof value === "string" ? value.trim().replace(",", ".") : "";
    if (!new RegExp(`^\\d{1,8}(\\.\\d{1,${scale}})?$`).test(s)) throw new MaterialError(`${label}: მიუთითე სწორი არაუარყოფითი რიცხვი.`);
    const n = new Prisma.Decimal(s);
    if (positive && n.lte(0)) throw new MaterialError(`${label}: რაოდენობა უნდა იყოს ნულზე მეტი.`);
    return n;
}
export function validDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s; }
export function readPurchase(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new MaterialError("პარტიის მონაცემები არასწორია.");
    const r = raw as Record<string, unknown>;
    const requestId = text(r.requestId, 100, true);
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId)) throw new MaterialError("მოთხოვნის კოდი არასწორია.");
    const date = text(r.purchaseDate, 10, true);
    if (!validDate(date)) throw new MaterialError("მიუთითე სწორი თარიღი.");
    if (r.receiptStatus !== "RECEIVED" && r.receiptStatus !== "IN_TRANSIT") throw new MaterialError("მიღების სტატუსი არასწორია.");
    if (!Array.isArray(r.items) || !r.items.length || r.items.length > 50) throw new MaterialError("პარტიაში დაამატე 1-დან 50-მდე მასალა.");
    const items = r.items.map((v: unknown) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new MaterialError("მასალის მონაცემები არასწორია.");
        const i = v as Record<string, unknown>;
        const unit = text(i.unit, 10, true);
        if (!UNITS.some(([key])=>key === unit)) throw new MaterialError("აირჩიე საზომი ერთეული.");
        const quantity = decimal(i.quantity,6,"რაოდენობა",true), defectiveQuantity = decimal(i.defectiveQuantity,6,"დეფექტური რაოდენობა");
        if (defectiveQuantity.gt(quantity)) throw new MaterialError("დეფექტური რაოდენობა სულ რაოდენობას არ უნდა აღემატებოდეს.");
        if (unit === "PCS" && (!quantity.isInteger() || !defectiveQuantity.isInteger())) throw new MaterialError("ცალობით მასალის რაოდენობა მთელი რიცხვი უნდა იყოს.");
        return {
            materialId: i.materialId ? text(i.materialId,100,true) : null,
            name: text(i.name,200,true), brand: text(i.brand,150), category: text(i.category,150,true),
            description: text(i.description,3000), color: text(i.color,150), size: text(i.size,150), characteristics: text(i.characteristics,1000), unit,
            quantity, defectiveQuantity, unitPurchasePrice: decimal(i.unitPurchasePrice,6,"შესყიდვის ფასი"),
        };
    });
    const ids = items.map(i=>i.materialId).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new MaterialError("ერთი მასალა ერთ პარტიაში მხოლოდ ერთხელ აირჩიე.");
    return { requestId, name:text(r.name,200), country:text(r.country,100).replace(/\s+/g," "), note:text(r.note,3000), purchaseDate: new Date(`${date}T00:00:00+04:00`), receiptStatus:r.receiptStatus as "RECEIVED" | "IN_TRANSIT", shippingCost:decimal(r.shippingCost,2,"ტრანსპორტირება"), customsCost:decimal(r.customsCost,2,"განბაჟება"), otherCost:decimal(r.otherCost,2,"სხვა ხარჯი"), items };
}
export type MaterialInput = ReturnType<typeof readPurchase>;
export function calculate(input: MaterialInput) {
    const D = Prisma.Decimal;
    const bases = input.items.map(i=>i.quantity.mul(i.unitPurchasePrice).toDecimalPlaces(2,D.ROUND_HALF_UP));
    const base = bases.reduce((sum,v)=>sum.plus(v),new D(0));
    const extra = input.shippingCost.plus(input.customsCost).plus(input.otherCost);
    if (base.isZero() && extra.gt(0)) throw new MaterialError("დამატებითი ხარჯების გასანაწილებლად მიუთითე მასალების შესყიდვის ფასი.");
    const cents = extra.mul(100);
    const portions = bases.map((b,index)=>{const exact = base.isZero() ? new D(0) : cents.mul(b).div(base); return {index, floor:exact.floor(), remainder:exact.minus(exact.floor())};});
    let left = cents.minus(portions.reduce((s,p)=>s.plus(p.floor),new D(0))).toNumber();
    for (const p of [...portions].sort((a,b)=>b.remainder.comparedTo(a.remainder)||a.index-b.index)) { if (left-- > 0) p.floor = p.floor.plus(1); }
    const rows = input.items.map((item,index)=>{const allocatedCost=portions[index].floor.div(100), totalCost=bases[index].plus(allocatedCost);return {allocatedCost,totalCost,finalUnitCost:totalCost.div(item.quantity).toDecimalPlaces(6,D.ROUND_HALF_UP)};});
    if (rows.some(r=>r.finalUnitCost.gte("1000000000000")||r.totalCost.gte("10000000000000000"))) throw new MaterialError("თანხა ზედმეტად დიდია. შეამცირე თანხა ან შეამოწმე საზომი ერთეული.");
    return { base, extra, total:base.plus(extra), rows };
}
