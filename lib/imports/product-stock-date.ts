import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export function validateProductStockDate(
    value: unknown,
): string | null {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (typeof value !== "string") {
        throw new ImportDraftFileError(
            "მარაგის თარიღის ფორმატი არასწორია.",
        );
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        throw new ImportDraftFileError(
            "მარაგის თარიღი მიუთითე ფორმატით წელი-თვე-დღე.",
        );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const leapYear =
        year % 400 === 0 ||
        (year % 4 === 0 && year % 100 !== 0);

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

    if (
        year < 1 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth[month - 1]
    ) {
        throw new ImportDraftFileError(
            "მარაგის თარიღი არასწორია — კალენდარში ასეთი დღე არ არსებობს.",
        );
    }

    return value;
}