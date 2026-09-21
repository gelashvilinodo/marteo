import { calculatePurchase } from "./calculate-purchase";

const pricingMethods = [
    "MANUAL",
    "FIXED_PROFIT",
    "MARKUP_PERCENT",
    "MARGIN_PERCENT",
] as const;

type PricingMethod = (typeof pricingMethods)[number];

type ReceiptStatus = "IN_TRANSIT" | "RECEIVED";

export class PurchaseValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PurchaseValidationError";
    }
}

function fail(message: string): never {
    throw new PurchaseValidationError(message);
}

function object(
    value: unknown,
    label: string,
): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail(`${label}: მონაცემების ფორმატი არასწორია.`);
    }

    return value as Record<string, unknown>;
}

function text(
    value: unknown,
    label: string,
    maxLength: number,
    required = false,
): string {
    if (value === undefined || value === null) {
        if (required) fail(`შეავსე ველი: ${label}.`);
        return "";
    }

    if (typeof value !== "string") {
        fail(`${label}: მონაცემების ფორმატი არასწორია.`);
    }

    const result = value.normalize("NFC").trim();

    if (required && !result) {
        fail(`შეავსე ველი: ${label}.`);
    }

    if (result.length > maxLength) {
        fail(`${label}: მაქსიმუმ ${maxLength} სიმბოლო.`);
    }

    return result;
}

function money(
    value: unknown,
    label: string,
    required = false,
): string {
    const result = text(value, label, 20, required);

    if (!result) return "0";

    if (!/^\d{1,10}(\.\d{1,2})?$/.test(result)) {
        fail(
            `${label}: მიუთითე არაუარყოფითი თანხა, მაქსიმუმ ორი ათწილადით.`,
        );
    }

    return result;
}

function purchaseDate(value: unknown): string {
    const result = text(value, "თარიღი", 10, true);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
        fail("თარიღის ფორმატი არასწორია.");
    }

    const parsed = new Date(`${result}T00:00:00.000Z`);

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== result
    ) {
        fail("მიუთითე სწორი თარიღი.");
    }

    return result;
}

export function validatePurchase(value: unknown) {
    const input = object(value, "პარტია");

    // არსებული ფორმა სტატუსს ჯერ არ აგზავნის.
    // ამიტომ ძველი მოთხოვნები კვლავ ჩამოსულად ჩაითვლება.
    const rawReceiptStatus =
        input.receiptStatus === undefined
            ? "RECEIVED"
            : input.receiptStatus;

    if (
        rawReceiptStatus !== "IN_TRANSIT" &&
        rawReceiptStatus !== "RECEIVED"
    ) {
        fail("პარტიის მიღების სტატუსი არასწორია.");
    }

    const receiptStatus: ReceiptStatus = rawReceiptStatus;

    if (
        !Array.isArray(input.items) ||
        input.items.length === 0 ||
        input.items.length > 200
    ) {
        fail("პარტიაში უნდა იყოს 1-დან 200-მდე ჩანაწერი.");
    }

    const purchaseItemIds = new Set<string>();

    const items = input.items.map((value, index) => {
        const item = object(value, `პროდუქტი ${index + 1}`);
        const label = `პროდუქტი ${index + 1}`;

        const purchaseItemId =
            text(
                item.purchaseItemId,
                `${label} — პარტიის პროდუქტის ჩანაწერი`,
                100,
            ) || null;

        if (purchaseItemId) {
            if (purchaseItemIds.has(purchaseItemId)) {
                fail(
                    `${label}: პარტიის პროდუქტის ჩანაწერი მეორდება.`,
                );
            }

            purchaseItemIds.add(purchaseItemId);
        }

        const quantity = text(
            item.quantity,
            `${label} — რაოდენობა`,
            7,
            true,
        );

        if (
            !/^\d+$/.test(quantity) ||
            Number(quantity) < 1 ||
            Number(quantity) > 1000000
        ) {
            fail(
                `${label}: რაოდენობა უნდა იყოს მთელი რიცხვი 1-დან 1 000 000-მდე.`,
            );
        }

        const defectiveQuantityText = text(
            item.defectiveQuantity,
            `${label} — წუნდებული რაოდენობა`,
            7,
        ) || "0";

        if (
            !/^\d+$/.test(defectiveQuantityText) ||
            Number(defectiveQuantityText) > Number(quantity)
        ) {
            fail(
                `${label}: წუნდებული რაოდენობა უნდა იყოს მთელი რიცხვი 0-დან საერთო რაოდენობამდე.`,
            );
        }

        const defectiveQuantity = Number(defectiveQuantityText);

        const defectNote = text(
            item.defectNote,
            `${label} — წუნის აღწერა`,
            2000,
        );

        if (
            receiptStatus === "IN_TRANSIT" &&
            (defectiveQuantity > 0 || defectNote)
        ) {
            fail(
                `${label}: წუნდებული რაოდენობა და აღწერა პარტიის მიღებისას მიუთითე.`,
            );
        }

        if (defectiveQuantity === 0 && defectNote) {
            fail(
                `${label}: წუნის აღწერისთვის მიუთითე წუნდებული რაოდენობაც.`,
            );
        }

        const unitPurchasePrice = money(
            item.unitPurchasePrice,
            `${label} — შესყიდვის ფასი`,
            true,
        );

        if (Number(unitPurchasePrice) <= 0) {
            fail(`${label}: შესყიდვის ფასი უნდა იყოს ნულზე მეტი.`);
        }

        const method = text(
            item.pricingMethod,
            `${label} — ფასის განსაზღვრის მეთოდი`,
            30,
            true,
        );

        if (!pricingMethods.includes(method as PricingMethod)) {
            fail(`${label}: ფასის განსაზღვრის მეთოდი არასწორია.`);
        }

        const pricingValue = money(
            item.pricingValue,
            `${label} — გასაყიდი ფასის პარამეტრი`,
            true,
        );

        if (
            method === "MARGIN_PERCENT" &&
            Number(pricingValue) >= 100
        ) {
            fail(`${label}: მარჟა 100%-ზე ნაკლები უნდა იყოს.`);
        }

        return {
            purchaseItemId,
            sourceInventoryItemId:
                text(
                    item.sourceInventoryItemId,
                    `${label} — მარაგის ჩანაწერი`,
                    100,
                ) || null,

            name: text(item.name, `${label} — სახელი`, 200, true),
            brand: text(item.brand, `${label} — ბრენდი`, 100),
            category: text(
                item.category,
                `${label} — კატეგორია`,
                100,
                true,
            ),
            description: text(
                item.description,
                `${label} — აღწერა`,
                2000,
            ),
            color: text(item.color, `${label} — ფერი`, 100),
            size: text(item.size, `${label} — ზომა`, 100),

            quantity,
            defectiveQuantity,
            defectNote,
            unitPurchasePrice,
            pricingMethod: method as PricingMethod,
            pricingValue,
        };
    });

    const result = {
        receiptStatus,
        name: text(input.name, "პარტიის სახელი", 200),
        note: text(input.note, "შენიშვნა", 2000),
        purchaseDate: purchaseDate(input.purchaseDate),
        shippingCost: money(input.shippingCost, "ტრანსპორტირება"),
        customsCost: money(input.customsCost, "განბაჟება"),
        otherCost: money(input.otherCost, "სხვა ხარჯი"),
        items,
    };

    let calculation: ReturnType<typeof calculatePurchase>;

    try {
        calculation = calculatePurchase(result);
    } catch (error) {
        fail(
            error instanceof Error
                ? error.message
                : "თანხების გამოთვლა ვერ მოხერხდა.",
        );
    }

    return {
        ...result,
        calculation,
    };
}