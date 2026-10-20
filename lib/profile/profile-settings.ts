export type ProfileSettingsData = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    email: string;
    phone: string;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ProfileSettingsField =
    | "firstName"
    | "lastName"
    | "form";

export class ProfileSettingsError extends Error {
    constructor(
        message: string,
        public status = 422,
        public field: ProfileSettingsField = "form",
    ) {
        super(message);
        this.name = "ProfileSettingsError";
    }
}

function readName(
    value: unknown,
    field: "firstName" | "lastName",
): string {
    const label = field === "firstName" ? "სახელი" : "გვარი";

    if (typeof value !== "string" || !value.trim()) {
        throw new ProfileSettingsError(
            `მიუთითე ${label}.`,
            422,
            field,
        );
    }

    const text = value.trim();

    if (/[\u0000-\u001f\u007f]/u.test(text)) {
        throw new ProfileSettingsError(
            `${label} შეიცავს დაუშვებელ სიმბოლოს.`,
            422,
            field,
        );
    }

    return text;
}

export function validateProfileSettings(value: unknown): {
    firstName: string;
    lastName: string;
    expectedUpdatedAt: Date;
} {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new ProfileSettingsError(
            "პროფილის მონაცემების ფორმატი არასწორია.",
            400,
        );
    }

    const input = value as Record<string, unknown>;

    const firstName = readName(input.firstName, "firstName");
    const lastName = readName(input.lastName, "lastName");

    if (typeof input.expectedUpdatedAt !== "string") {
        throw new ProfileSettingsError(
            "მონაცემების ვერსია ვერ დადასტურდა. განაახლე პროფილის მონაცემები.",
            409,
        );
    }

    const expectedUpdatedAt = new Date(
        input.expectedUpdatedAt,
    );

    if (
        !Number.isFinite(expectedUpdatedAt.getTime()) ||
        expectedUpdatedAt.toISOString() !== input.expectedUpdatedAt
    ) {
        throw new ProfileSettingsError(
            "მონაცემების ვერსია არასწორია. განაახლე პროფილის მონაცემები.",
            409,
        );
    }

    return {
        firstName,
        lastName,
        expectedUpdatedAt,
    };
}