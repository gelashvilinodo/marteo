import "server-only";

import {
    EmailChangeError,
    emailChangeJson,
    hashEmailChangeValue,
} from "./email-change";

// Shared request and session checks.
export {
    EmailChangeError as PhoneChangeError,
    emailChangeJson as phoneChangeJson,
    hashEmailChangeValue as hashPhoneChangeValue,
    readEmailChangeBody as readPhoneChangeBody,
    readEmailChangeSession as readPhoneChangeSession,
} from "./email-change";

export const PHONE_CHANGE_LIFETIME_MS = 10 * 60 * 1000;
export const PHONE_CHANGE_RESEND_SECONDS = 60;
export const PHONE_CHANGE_MAX_ATTEMPTS = 5;

export function hashPhoneChangeCode(
    authorization: string,
    code: string,
): string {
    return hashEmailChangeValue(
        `phone-change:${authorization}:${code}`,
    );
}

export function normalizeProfilePhone(value: unknown): string {
    if (typeof value !== "string") {
        throw new EmailChangeError(
            "მიუთითე ახალი ტელეფონის ნომერი.",
            422,
        );
    }

    const compact = value
        .trim()
        .replace(/[\s()\-]/g, "")
        .replace(/^00/, "+");

    const normalized = /^\d{9}$/.test(compact)
        ? `+995${compact}`
        : compact;

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new EmailChangeError(
            "მიუთითე 9-ციფრიანი ქართული ნომერი ან საერთაშორისო ნომერი ქვეყნის კოდით, მაგალითად +995…",
            422,
        );
    }

    return normalized;
}

export function phoneChangeFailure(cause: unknown) {
    if (cause instanceof EmailChangeError) {
        return emailChangeJson(
            {
                success: false,
                message: cause.message,
                retryAfter: cause.retryAfter,
            },
            cause.status,
            cause.retryAfter,
        );
    }

    console.error("Phone change request failed");

    return emailChangeJson(
        {
            success: false,
            message:
                "მოთხოვნის შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
        },
        500,
    );
}