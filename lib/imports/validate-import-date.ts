import type { ImportValidationResult } from "./import-types";

type Options = {
    field: string;
    label: string;
    textOrder?: "DMY" | "MDY";
    excelDateSystem?: "1900" | "1904";
};

export function validateImportDate(
    value: unknown,
    options: Options,
): ImportValidationResult<string> {
    function fail(
        code: string,
        message: string,
    ): ImportValidationResult<string> {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: options.field,
                code,
                message: `${options.label}: ${message}`,
            }],
        };
    }

    function finish(
        year: number,
        month: number,
        day: number,
    ): ImportValidationResult<string> {
        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            !Number.isInteger(day) ||
            year < 1900 ||
            year > 9999 ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31
        ) {
            return fail("INVALID_DATE", "თარიღი არასწორია.");
        }

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            return fail(
                "INVALID_DATE",
                "ასეთი კალენდარული თარიღი არ არსებობს.",
            );
        }

        return {
            valid: true,
            data: [
                String(year).padStart(4, "0"),
                String(month).padStart(2, "0"),
                String(day).padStart(2, "0"),
            ].join("-"),
            issues: [],
        };
    }

    if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && !value.trim())
    ) {
        return fail(
            "DATE_REQUIRED",
            "აირჩიე თარიღი ან გამოიყენე ჯგუფისთვის მითითებული თარიღი.",
        );
    }

    if (typeof value === "number") {
        if (
            !options.excelDateSystem ||
            !Number.isInteger(value) ||
            value < 0 ||
            value > 3_000_000
        ) {
            return fail(
                "EXCEL_DATE_RULE_REQUIRED",
                "Excel-ის თარიღის რიცხვითი მნიშვნელობა დამატებით დამუშავებას მოითხოვს.",
            );
        }

        if (
            options.excelDateSystem === "1900" &&
            (value === 0 || value === 60)
        ) {
            return fail(
                "INVALID_EXCEL_DATE",
                "Excel-ის ეს მნიშვნელობა ნამდვილ თარიღს არ შეესაბამება.",
            );
        }

        const base = options.excelDateSystem === "1904"
            ? Date.UTC(1904, 0, 1)
            : Date.UTC(1899, 11, 31);

        const days =
            options.excelDateSystem === "1900" && value > 60
                ? value - 1
                : value;

        const date = new Date(base + days * 86_400_000);

        return finish(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
        );
    }

    if (typeof value !== "string") {
        return fail("INVALID_DATE", "თარიღის ფორმატი არასწორია.");
    }

    const raw = value.trim();

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

    if (iso) {
        return finish(
            Number(iso[1]),
            Number(iso[2]),
            Number(iso[3]),
        );
    }

    const parts = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/.exec(raw);

    if (!parts) {
        return fail(
            "UNSUPPORTED_DATE_FORMAT",
            "მოსალოდნელია სრული თარიღი, მაგალითად 18.10.2026.",
        );
    }

    if (!options.textOrder) {
        return fail(
            "DATE_ORDER_REQUIRED",
            "დაადასტურე თარიღის თანმიმდევრობა: დღე/თვე/წელი თუ თვე/დღე/წელი.",
        );
    }

    const first = Number(parts[1]);
    const second = Number(parts[3]);

    return finish(
        Number(parts[4]),
        options.textOrder === "DMY" ? second : first,
        options.textOrder === "DMY" ? first : second,
    );
}