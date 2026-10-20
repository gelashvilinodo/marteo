import {
    ImportDraftFileError,
} from "./validate-import-draft-file";
import {
    validateImportMoney,
} from "./validate-import-money";

export type OrderImportOptions = {
    missingStatus: "UNRESOLVED" | "PROCESSING" | "COMPLETED";
    missingPayment: "UNRESOLVED" | "PAID" | "UNPAID";
    stockEffect: "UNRESOLVED" | "HISTORY_ONLY" | "DEDUCT_LINKED";
    grouping: "UNRESOLVED" | "EACH_ROW" | "PHONE_AND_DATE";
    fallbackDate: string | null;
    fallbackCourierFee: string | null;
    dateOrder: "DMY" | "MDY" | null;
    paymentDateMode: "UNRESOLVED" | "ORDER_DATE" | "COMMON_DATE";
    fallbackPaymentDate: string | null;
};

export function createOrderImportOptions(): OrderImportOptions {
    return {
        missingStatus: "UNRESOLVED",
        missingPayment: "UNRESOLVED",
        stockEffect: "HISTORY_ONLY",
        grouping: "UNRESOLVED",
        fallbackDate: null,
        fallbackCourierFee: null,
        dateOrder: null,
        paymentDateMode: "UNRESOLVED",
        fallbackPaymentDate: null,
    };
}

function fail(message: string): never {
    throw new ImportDraftFileError(message);
}

function readChoice<T extends string>(
    value: unknown,
    choices: readonly T[],
    label: string,
): T {
    if (
        typeof value !== "string" ||
        !choices.includes(value as T)
    ) {
        fail(`${label}: იმპორტის არჩევანი არასწორია.`);
    }

    return value as T;
}

function readFallbackDate(value: unknown): string | null {
    if (value === null) return null;

    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        fail(
            "საერთო თარიღი მიუთითე ფორმატით წელი-თვე-დღე.",
        );
    }

    const [year, month, day] = value.split("-").map(Number);

    if (year < 1 || month < 1 || month > 12 || day < 1) {
        fail("მითითებული საერთო თარიღი კალენდარში არ არსებობს.");
    }

    const leapYear =
        year % 4 === 0 &&
        (year % 100 !== 0 || year % 400 === 0);

    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    if (day > daysInMonth[month - 1]) {
        fail("მითითებული საერთო თარიღი კალენდარში არ არსებობს.");
    }

    return value;
}

function readFallbackCourierFee(value: unknown): string | null {
    if (
        value === undefined ||
        value === null ||
        (
            typeof value === "string" &&
            value.trim() === ""
        )
    ) {
        return null;
    }

    const result = validateImportMoney(value, {
        field: "courierFee",
        label: "საერთო კურიერის საფასური",
        decimalSeparator: ".",
    });

    if (!result.valid) {
        fail(
            result.issues
                .map(issue => issue.message)
                .join(" "),
        );
    }

    return result.data;
}


export function validateOrderImportOptions(
    value: unknown,
): OrderImportOptions {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail(
            "შეკვეთების საერთო არჩევანების სტრუქტურა არასწორია.",
        );
    }

    const input = value as Record<string, unknown>;

    return {
        missingStatus: readChoice(
            input.missingStatus,
            ["UNRESOLVED", "PROCESSING", "COMPLETED"] as const,
            "სტატუსის გარეშე შეკვეთები",
        ),
        missingPayment: readChoice(
            input.missingPayment,
            ["UNRESOLVED", "PAID", "UNPAID"] as const,
            "გადახდის გარეშე შეკვეთები",
        ),
        stockEffect: readChoice(
            input.stockEffect,
            ["UNRESOLVED", "HISTORY_ONLY", "DEDUCT_LINKED"] as const,
            "მარაგზე გავლენა",
        ),
        grouping: readChoice(
            input.grouping,
            ["UNRESOLVED", "EACH_ROW", "PHONE_AND_DATE"] as const,
            "კოდის გარეშე შეკვეთების დაჯგუფება",
        ),
        fallbackDate: readFallbackDate(input.fallbackDate),
        paymentDateMode: input.paymentDateMode === undefined
            ? "UNRESOLVED"
            : readChoice(
                input.paymentDateMode,
                ["UNRESOLVED", "ORDER_DATE", "COMMON_DATE"] as const,
                "თანხის მიღების თარიღის წესი",
            ),
        fallbackPaymentDate:
            input.fallbackPaymentDate === undefined
                ? null
                : readFallbackDate(input.fallbackPaymentDate),
        fallbackCourierFee: readFallbackCourierFee(
            input.fallbackCourierFee,
        ),
        dateOrder:
            input.dateOrder === undefined || input.dateOrder === null
                ? null
                : readChoice(
                    input.dateOrder,
                    ["DMY", "MDY"] as const,
                    "თარიღის თანმიმდევრობა",
                ),
    };
}