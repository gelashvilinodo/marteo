// სერვერსა და ჩატის ბარათს შორის გაზიარებული ტიპები.
export type AiSourceRow = { row: number; cells: string[] };

export type AiDraftItem = {
    row: number;
    originalName: string;
    name: string;
    brand: string | null;
    category: string;
    description: string | null;
    color: string | null;
    size: string | null;
    unit: string;
    quantity: number;
    unitPrice: number;
    altUnitPrice: number | null;
    // არსებული ვარიანტი (existingVariant) ან იმავე პროდუქტის სხვა ვარიანტი.
    sourceInventoryItemId: string | null;
    existingVariant: boolean;
    materialId: string | null;
    // რაოდენობა და ფასი ფაილის იმავე რიგში მოიძებნა.
    checked: boolean;
};

export type AiPurchaseDraft = {
    target: "products" | "materials";
    fileName: string;
    photoCount: number;
    currency: string | null;
    currencyReason: string;
    supplier: string | null;
    country: string | null;
    purchaseDate: string | null;
    priceColumns: { main: string; alternative: string | null };
    items: AiDraftItem[];
    totals: { quantity: number; amount: number; altAmount: number | null };
    extraAmounts: Array<{ row: number; label: string; amount: number }>;
    paymentHints: Array<{ amount: number; currency: string }>;
    notes: string[];
    warnings: string[];
};
