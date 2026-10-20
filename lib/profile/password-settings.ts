export type PasswordSettingsField =
    | "currentPassword"
    | "newPassword"
    | "confirmPassword"
    | "form";

export class PasswordSettingsError extends Error {
    constructor(
        message: string,
        public status = 422,
        public field: PasswordSettingsField = "form",
        public retryAfter = 0,
    ) {
        super(message);
        this.name = "PasswordSettingsError";
    }
}

export function getNewPasswordRules(password: string) {
    return {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
    };
}

export function validateNewPassword(
    value: unknown,
): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new PasswordSettingsError(
            "შეიყვანე ახალი პაროლი.",
            422,
            "newPassword",
        );
    }

    const rules = getNewPasswordRules(value);

    if (!Object.values(rules).every(Boolean)) {
        throw new PasswordSettingsError(
            "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს, დიდ და პატარა ლათინურ ასოებს და ციფრს.",
            422,
            "newPassword",
        );
    }

    // bcrypt processes at most 72 bytes.
    // Reject longer values instead of silently truncating them.
    if (new TextEncoder().encode(value).byteLength > 72) {
        throw new PasswordSettingsError(
            "პაროლი ზედმეტად გრძელია. გამოიყენე უფრო მოკლე პაროლი.",
            422,
            "newPassword",
        );
    }

    return value;
}

export function validatePasswordChange(value: unknown): {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
} {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new PasswordSettingsError(
            "მონაცემების ფორმატი არასწორია.",
            400,
        );
    }

    const input = value as Record<string, unknown>;

    if (
        typeof input.currentPassword !== "string" ||
        input.currentPassword.length === 0
    ) {
        throw new PasswordSettingsError(
            "შეიყვანე მიმდინარე პაროლი.",
            422,
            "currentPassword",
        );
    }

    const newPassword = validateNewPassword(input.newPassword);

    if (
        typeof input.confirmPassword !== "string" ||
        input.confirmPassword.length === 0
    ) {
        throw new PasswordSettingsError(
            "გაიმეორე ახალი პაროლი.",
            422,
            "confirmPassword",
        );
    }

    if (input.confirmPassword !== newPassword) {
        throw new PasswordSettingsError(
            "პაროლები არ ემთხვევა.",
            422,
            "confirmPassword",
        );
    }

    if (input.currentPassword === newPassword) {
        throw new PasswordSettingsError(
            "ახალი პაროლი მიმდინარე პაროლისგან განსხვავებული უნდა იყოს.",
            422,
            "newPassword",
        );
    }

    return {
        currentPassword: input.currentPassword,
        newPassword,
        confirmPassword: input.confirmPassword,
    };
}