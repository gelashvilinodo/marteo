import type { buildProductImportPlan } from "./build-product-import-plan";
import { validateProductStockDate } from "./product-stock-date";
import type { ProductStockPolicy } from "./product-stock-policy";

// Date entry must not depend on a successful existing-product lookup.
export function getProductStockDateReview(
    plan: ReturnType<typeof buildProductImportPlan>,
    value: string | null,
    policy: ProductStockPolicy | null,
) {
    const affectedCount = plan.items.filter(item =>
        item.record.mode === "CURRENT_STOCK" &&
        item.record.data?.currentStock !== null &&
        item.record.data?.currentStock !== undefined &&
        !(item.inventoryItemId !== null && policy === "KEEP_EXISTING")
    ).length;
    let error: string | null = null;
    if (affectedCount > 0) {
        try {
            if (validateProductStockDate(value) === null) {
                error = "აირჩიე, რომელ დღეს არსებულ ნაშთს ტვირთავ. თარიღი ყველა პროდუქტისთვის ერთხელ ივსება.";
            }
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "მარაგის თარიღი გადასამოწმებელია.";
        }
    }
    return { affectedCount, error };
}
