export type BusinessSettingsData = {
    id: string;
    name: string;
    logoUrl: string | null;
    phone: string | null;
    updatedAt: string;
};

export class BusinessSettingsError extends Error {
    constructor(
        message: string,
        public status = 422,
        public field: "name" | "phone" | "form" = "form",
    ) {
        super(message);
        this.name = "BusinessSettingsError";
    }
}

function readPhone(value: unknown): string | null {
    if (typeof value !== "string") {
        throw new BusinessSettingsError(
            "ბიზნესის ტელეფონის ფორმატი არასწორია.",
            422,
            "phone",
        );
    }

    const text = value.trim();

    if (!text) return null;

    const compact = text
        .replace(/[\s()\-]/g, "")
        .replace(/^00/, "+");

    const normalized = /^\d{9}$/.test(compact)
        ? `+995${compact}`
        : compact;

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new BusinessSettingsError(
            "მიუთითე 9-ციფრიანი ქართული ნომერი ან საერთაშორისო ნომერი ქვეყნის კოდით, მაგალითად +995…",
            422,
            "phone",
        );
    }

    return normalized;
}

export function validateBusinessSettings(value: unknown): {
    name: string;
    phone: string | null;
    expectedUpdatedAt: Date;
} {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new BusinessSettingsError(
            "ბიზნესის მონაცემების ფორმატი არასწორია.",
            400,
        );
    }

    const input = value as Record<string, unknown>;

    if (
        typeof input.name !== "string" ||
        !input.name.trim()
    ) {
        throw new BusinessSettingsError(
            "მიუთითე ბიზნესის სახელი.",
            422,
            "name",
        );
    }

    const name = input.name.trim();

    if (typeof input.expectedUpdatedAt !== "string") {
        throw new BusinessSettingsError(
            "ბიზნესის მონაცემების ვერსია ვერ დადასტურდა. განაახლე გვერდი.",
            409,
        );
    }

    const expectedUpdatedAt = new Date(
        input.expectedUpdatedAt,
    );

    if (
        !Number.isFinite(expectedUpdatedAt.getTime()) ||
        expectedUpdatedAt.toISOString() !==
            input.expectedUpdatedAt
    ) {
        throw new BusinessSettingsError(
            "ბიზნესის მონაცემების ვერსია არასწორია. განაახლე გვერდი.",
            409,
        );
    }

    return {
        name,
        phone: readPhone(input.phone),
        expectedUpdatedAt,
    };
}