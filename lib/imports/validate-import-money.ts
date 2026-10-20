import type { ImportValidationResult } from "./import-types";

type Options = {
    field: string;
    label: string;
    decimalSeparator: "." | ",";
    allowNegative?: boolean;
};

export function validateImportMoney(
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

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fail("MONEY_REQUIRED", "თანხა მითითებული არ არის.");
    }

    let raw: string;

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            return fail("INVALID_MONEY", "თანხა არასწორია.");
        }

        // Excel-ის რიცხვითი უჯრედი უკვე წაკითხული რიცხვია.
        raw = String(value);
    } else if (typeof value === "string") {
        raw = value.trim();

        // ინტერვალით დაჯგუფებული ათასეულები:
        // 1 234,56 ან 1 234.56.
        const spaced = raw.replace(/[\u00a0\u202f]/g, " ");

        if (spaced.includes(" ")) {
            const grouped = options.decimalSeparator === ","
                ? /^-?\d{1,3}(?: \d{3})+(?:,\d{1,2})?$/
                : /^-?\d{1,3}(?: \d{3})+(?:\.\d{1,2})?$/;

            if (!grouped.test(spaced)) {
                return fail(
                    "AMBIGUOUS_MONEY",
                    "თანხის ფორმატი გაურკვეველია.",
                );
            }

            raw = spaced.replace(/ /g, "");
        }

        if (options.decimalSeparator === ",") {
            raw = raw.replace(",", ".");
        } else if (raw.includes(",")) {
            return fail(
                "AMBIGUOUS_MONEY",
                "ათწილადის გამყოფი არ ემთხვევა არჩეულ წესს.",
            );
        }
    } else {
        return fail("INVALID_MONEY", "მოსალოდნელია თანხა.");
    }

    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
        return fail(
            "INVALID_MONEY",
            "მიუთითე რიცხვი მაქსიმუმ ორი ათწილადით. ვალუტის ნიშნები და ფორმულები დაუშვებელია.",
        );
    }

    const negative = raw.startsWith("-");
    const unsigned = negative ? raw.slice(1) : raw;
    const [whole, fraction = ""] = unsigned.split(".");

    const cents =
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));

    if (negative && cents > 0n && !options.allowNegative) {
        return fail(
            "NEGATIVE_MONEY",
            "ამ ველში უარყოფითი თანხა დაუშვებელია.",
        );
    }

    // საერთო იმპორტის საწყისი ზღვარი:
    // არსებული Decimal(12, 2) თანხის ველებს შეესაბამება.
    if (cents > 999999999999n) {
        return fail(
            "MONEY_TOO_LARGE",
            "თანხა დასაშვებ ზღვარს აღემატება.",
        );
    }

    const normalized =
        `${negative && cents > 0n ? "-" : ""}` +
        `${cents / 100n}.` +
        String(cents % 100n).padStart(2, "0");

    return {
        valid: true,
        data: normalized,
        issues: [],
    };
}