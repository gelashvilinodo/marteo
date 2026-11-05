export type PurchasePlanEntry = {
    id: string;
    inventoryItemId: string;
    quantity: number;
    reason: string | null;
    source: "AI" | "MANUAL";
    createdAt: string;
    name: string;
    color: string | null;
    size: string | null;
    sku: string;
    imageUrl: string | null;
    goodStock: number;
    lastUnitPrice: string | null;
};

// სიის ყოველი ცვლილება ამ მოვლენით ვრცელდება: გვერდი, მენიუს ციფრი და AI-ის ბარათები ახლდება.
export const PURCHASE_PLAN_CHANGED = "marteo:purchase-plan-changed";

// შესყიდვების გვერდზე მონიშნული პროდუქტებით ახალი შესყიდვის ფანჯარა იხსნება.
export const PURCHASE_FROM_PLAN = "marteo:purchase-from-plan";

export type PurchaseFromPlanDetail = {
    items: Array<{ planItemId: string; inventoryItemId: string; quantity: number }>;
};

async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { success?: boolean; message?: string; error?: string } | null;

    if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "შესაძენი სია ვერ განახლდა. სცადეთ ხელახლა.");
    }

    window.dispatchEvent(new Event(PURCHASE_PLAN_CHANGED));
    return data;
}

export function addPlanItem(input: { inventoryItemId: string; quantity: number; reason?: string; source: "AI" | "MANUAL" }) {
    return send("/api/purchase-plan", "POST", input);
}

export function updatePlanItem(id: string, quantity: number) {
    return send(`/api/purchase-plan/${encodeURIComponent(id)}`, "PATCH", { quantity });
}

export function removePlanItem(id: string) {
    return send(`/api/purchase-plan/${encodeURIComponent(id)}`, "DELETE");
}
