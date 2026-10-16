export class InventoryEditError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "InventoryEditError";
    }
}

export type InventoryEditInput = {
    expectedInventoryUpdatedAt: string;
    expectedProductUpdatedAt: string;
    name: string;
    brand: string | null;
    category: string | null;
    description: string | null;
    color: string | null;
    size: string | null;
    imageUrl: string | null;
    salePrice: string | null;
};

const allowedFields = new Set([
    "expectedInventoryUpdatedAt",
    "expectedProductUpdatedAt",
    "name",
    "brand",
    "category",
    "description",
    "color",
    "size",
    "imageUrl",
    "salePrice",
]);

export function validateInventoryEdit(
    value: unknown,
): InventoryEditInput {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new InventoryEditError("მოთხოვნის ფორმატი არასწორია.");
    }

    const input = value as Record<string, unknown>;

    if (Object.keys(input).some(key => !allowedFields.has(key))) {
        throw new InventoryEditError(
            "მოთხოვნა შეიცავს გაუთვალისწინებელ ველს.",
        );
    }

    function text(key: string): string {
        const result = input[key];

        if (typeof result !== "string") {
            throw new InventoryEditError(
                "ფორმის მონაცემები არასრულია ან არასწორია.",
            );
        }

        return result.trim();
    }

    function optionalText(key: string): string | null {
        if (input[key] === null) return null;
        return text(key) || null;
    }

    function version(key: string): string {
        const result = text(key);
        const date = new Date(result);

        if (
            !Number.isFinite(date.getTime()) ||
            date.toISOString() !== result
        ) {
            throw new InventoryEditError(
                "მონაცემების ვერსია არასწორია. გახსენი ფორმა ხელახლა.",
            );
        }

        return result;
    }

    const name = text("name");

    if (!name) {
        throw new InventoryEditError(
            "მიუთითე პროდუქტის დასახელება.",
        );
    }

    const imageUrl = optionalText("imageUrl");

    if (imageUrl) {
        let parsed: URL;

        try {
            parsed = new URL(imageUrl);
        } catch {
            throw new InventoryEditError(
                "პროდუქტის ფოტოს მისამართი არასწორია.",
            );
        }

        if (
            !["https:", "http:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password
        ) {
            throw new InventoryEditError(
                "პროდუქტის ფოტოს მისამართი არასწორია.",
            );
        }
    }

    const rawPrice = optionalText("salePrice")?.replace(",", ".");
    let salePrice: string | null = null;

    if (rawPrice) {
        if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(rawPrice)) {
            throw new InventoryEditError(
                "გასაყიდი ფასი უნდა იყოს არაუარყოფითი რიცხვი, მაქსიმუმ ორი ათწილადი ნიშნით.",
            );
        }

        const [whole, fraction = ""] = rawPrice.split(".");

        salePrice =
            `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
    }

    return {
        expectedInventoryUpdatedAt:
            version("expectedInventoryUpdatedAt"),
        expectedProductUpdatedAt:
            version("expectedProductUpdatedAt"),
        name,
        brand: optionalText("brand"),
        category: optionalText("category"),
        description: optionalText("description"),
        color: optionalText("color"),
        size: optionalText("size"),
        imageUrl,
        salePrice,
    };
}