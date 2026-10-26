export class CostInputError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
    }
}
export type CostScope = {
    inventoryItemId?: string;
    orderId?: string;
};
export type CostRow = {
    key: string;
    kind: "stock" | "order";
    name: string;
    quantity: number;
    orderNumber: number | null;
    date: string | null;
    inventoryItemId: string | null;
    orderId: string | null;
};
export type CostPreview = {
    token: string;
    rows: CostRow[];
    hasMore: boolean;
};
export function readCostScope(value: Record<string, unknown>): CostScope {
    const scope: CostScope = {};
    for (const key of ["inventoryItemId", "orderId"] as const) {
        if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
            if (typeof value[key] !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value[key]))
                throw new CostInputError("პროდუქტის ან შეკვეთის კოდი არასწორია.");
            scope[key] = value[key];
        }
    }
    if (scope.inventoryItemId && scope.orderId)
        throw new CostInputError("აირჩიე პროდუქტი ან შეკვეთა.");
    return scope;
}
export function readCostInput(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new CostInputError("მონაცემები არასწორია.");
    const body = value as Record<string, unknown>;
    const scope = readCostScope(body);
    if (body.confirmed !== true || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
        throw new CostInputError("გადაამოწმე და დაადასტურე შესანახი მონაცემები.");
    if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 300)
        throw new CostInputError("შეავსე სულ მცირე ერთი თვითღირებულება.");
    const seen = new Set<string>();
    const entries = body.entries.map((raw: unknown) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new CostInputError("თვითღირებულების ფორმატი არასწორია.");
        const row = raw as Record<string, unknown>;
        if (typeof row.key !== "string" || !/^(stock|order):[a-zA-Z0-9_-]{1,100}$/.test(row.key) || seen.has(row.key))
            throw new CostInputError("პროდუქტი გამეორებულია ან მისი კოდი არასწორია.");
        seen.add(row.key);
        const unitCost = typeof row.unitCost === "string" ? row.unitCost.trim().replace(",", ".") : "";
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(unitCost))
            throw new CostInputError("თვითღირებულება მიუთითე არაუარყოფითი თანხით, მაქსიმუმ ორი ათწილადით.");
        return {
            key: row.key,
            unitCost
        };
    });
    return {
        scope,
        token: body.token,
        entries
    };
}
