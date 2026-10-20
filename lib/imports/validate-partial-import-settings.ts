import { validateImportDraftSettings, type ImportDraftSettings } from "./validate-import-draft-settings";
import type { ImportCompletedSections } from "./read-import-completed-sections";

function stable(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => item !== null && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

// Once a category is imported, its settings and provenance stay immutable.
// Unfinished categories can still be corrected without restarting the import.
export function validatePartialImportSettings(input: {
    savedSettings: unknown;
    nextSettings: unknown;
    completed: ImportCompletedSections;
    businessId: string;
}): ImportDraftSettings {
    const saved = validateImportDraftSettings(input.savedSettings, input.businessId);
    const next = validateImportDraftSettings(input.nextSettings, input.businessId);
    const protectedFields: (keyof ImportDraftSettings)[] = ["workspaceVersion"];
    if (input.completed.customers) protectedFields.push("customerMappings", "customerEdits", "excludedCustomerKeys", "existingCustomerLinks");
    if (input.completed.products) protectedFields.push("productMappings", "productEdits", "excludedProductKeys", "existingProductLinks", "productDuplicateDecisions", "productPhotoDecisions", "productStockDate", "productStockPolicy");
    if (input.completed.orders) protectedFields.push("orderMappings", "orderEdits", "orderOptions", "excludedOrderKeys", "orderGroupingConfirmations", "orderCustomerDecisions", "skipOrderCustomers");
    if (protectedFields.some(field => stable(saved[field]) !== stable(next[field]))) {
        throw new Error("უკვე გადმოტანილი კატეგორიის მონაცემები ამ მონახაზში აღარ იცვლება. შეგიძლია გაასწორო დარჩენილი კატეგორიები.");
    }
    return next;
}
