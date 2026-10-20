import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export type ProductStockPolicy =
    | "ADD"
    | "SET_CURRENT"
    | "KEEP_EXISTING";

export const productStockPolicyOptions: ReadonlyArray<{
    value: ProductStockPolicy;
    label: string;
    description: string;
}> = [
    {
        value: "ADD",
        label: "დაემატოს არსებულ რაოდენობას",
        description:
            "მაგალითად, MARTEO-ში არსებული 5 და ფაილში მითითებული 12 გახდება 17.",
    },
    {
        value: "SET_CURRENT",
        label: "ფაილის რაოდენობა გახდეს მიმდინარე ნაშთი",
        description:
            "მაგალითად, MARTEO-ში არსებული 5 ჩანაცვლდება ფაილში მითითებული 12-ით.",
    },
    {
        value: "KEEP_EXISTING",
        label: "რაოდენობა არ შეიცვალოს",
        description:
            "ფაილის რაოდენობა არ გამოიყენება. MARTEO-ში არსებული ნაშთი შენარჩუნდება.",
    },
];

export function validateProductStockPolicy(
    value: unknown,
): ProductStockPolicy | null {
    if (value === undefined || value === null) return null;

    if (
        value === "ADD" ||
        value === "SET_CURRENT" ||
        value === "KEEP_EXISTING"
    ) {
        return value;
    }

    throw new ImportDraftFileError(
        "არსებული პროდუქტების ნაშთის გამოყენების არჩევანი არასწორია.",
    );
}

export function calculateImportedStock({
    existingStock,
    importedStock,
    policy,
}: {
    existingStock: number;
    importedStock: number;
    policy: ProductStockPolicy;
}): {
    previousStock: number;
    nextStock: number;
    adjustment: number;
} {
    const maxStock = 2_147_483_647;

    function checkStock(value: number): void {
        if (
            !Number.isSafeInteger(value) ||
            value < 0 ||
            value > maxStock
        ) {
            throw new ImportDraftFileError(
                "მარაგის რაოდენობა დასაშვებ ფარგლებში არსებული არაუარყოფითი მთელი რიცხვი უნდა იყოს.",
            );
        }
    }

    checkStock(existingStock);
    checkStock(importedStock);

    const checkedPolicy = validateProductStockPolicy(policy);

    if (checkedPolicy === null) {
        throw new ImportDraftFileError(
            "აირჩიე, როგორ გამოვიყენოთ არსებული პროდუქტის ნაშთი.",
        );
    }

    const nextStock =
        checkedPolicy === "ADD"
            ? existingStock + importedStock
            : checkedPolicy === "SET_CURRENT"
                ? importedStock
                : existingStock;

    checkStock(nextStock);

    return {
        previousStock: existingStock,
        nextStock,
        adjustment: nextStock - existingStock,
    };
}