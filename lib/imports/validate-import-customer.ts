import type {
    ImportedCustomer,
    ImportIssue,
    ImportValidationResult,
} from "./import-types";

export function validateImportCustomer(
    value: unknown,
): ImportValidationResult<ImportedCustomer> {
    const issues: ImportIssue[] = [];

    function error(
        field: string | null,
        code: string,
        message: string,
    ) {
        issues.push({
            severity: "ERROR",
            field,
            code,
            message,
        });
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: null,
                code: "INVALID_CUSTOMER",
                message: "მომხმარებლის მონაცემები არასწორ ფორმატშია.",
            }],
        };
    }

    const input = value as Record<string, unknown>;

    function readText(field: string, label: string): string {
        const raw = input[field];

        if (raw === undefined || raw === null) return "";

        if (typeof raw !== "string") {
            error(
                field,
                "INVALID_TEXT",
                `${label}: მოსალოდნელია ტექსტური მნიშვნელობა.`,
            );
            return "";
        }

        return raw
            .normalize("NFC")
            .replace(/\r\n?/g, "\n")
            .trim();
    }

    const firstName = readText("firstName", "სახელი");
    const lastName = readText("lastName", "გვარი");
    const address = readText("address", "მისამართი");

    let phoneText = "";
    const rawPhone = input.phone;

    if (typeof rawPhone === "string") {
        phoneText = rawPhone.normalize("NFC").trim();
    } else if (
        typeof rawPhone === "number" &&
        Number.isSafeInteger(rawPhone) &&
        rawPhone > 0
    ) {
        phoneText = String(rawPhone);

        issues.push({
            severity: "WARNING",
            field: "phone",
            code: "NUMERIC_PHONE",
            message:
                "ტელეფონი ფაილში რიცხვადაა შენახული. გადაამოწმე: საწყისი ნულები შესაძლოა დაკარგული იყოს.",
        });
    } else if (
        rawPhone !== undefined &&
        rawPhone !== null
    ) {
        error(
            "phone",
            "INVALID_PHONE_TYPE",
            "ტელეფონის ნომრის ფორმატი არასწორია.",
        );
    }

    let phone = "";

    if (!phoneText) {
        error(
            "phone",
            "PHONE_REQUIRED",
            "მომხმარებლის ტელეფონის ნომერი არ არის მითითებული. მომხმარებლის შესანახად ტელეფონი და მისამართი აუცილებელია; სახელი და გვარი არასავალდებულოა. მიუთითე ტელეფონის სვეტი, შეავსე ეს ჩანაწერი ან გამოტოვე მისი იმპორტი.",
        );
    } else if (!/^\+?[\d\s()-]+$/.test(phoneText)) {
        error(
            "phone",
            "INVALID_PHONE",
            "მიუთითე ერთი სწორი ტელეფონის ნომერი.",
        );
    } else {
        let digits = phoneText.replace(/\D/g, "");

        if (digits.startsWith("00")) {
            digits = digits.slice(2);
        }

        // იგივე წესი, რაც MARTEO-ს არსებულ ნომრებზე მოქმედებს.
        if (/^5\d{8}$/.test(digits)) {
            digits = `995${digits}`;
        }

        if (!/^[1-9]\d{7,14}$/.test(digits)) {
            error(
                "phone",
                "INVALID_PHONE",
                "ტელეფონის ნომერი არასწორია. გადაამოწმე ქვეყნის კოდიც.",
            );
        } else {
            phone = `+${digits}`;
        }
    }

    if (!address) {
        error(
            "address",
            "ADDRESS_REQUIRED",
            "მომხმარებლის მისამართი არ არის მითითებული. მომხმარებლის შესანახად ტელეფონი და მისამართი აუცილებელია; სახელი და გვარი არასავალდებულოა. მიუთითე მისამართის სვეტი, შეავსე ეს ჩანაწერი ან გამოტოვე მისი იმპორტი.",
        );
    }

    if (issues.some(issue => issue.severity === "ERROR")) {
        return {
            valid: false,
            data: null,
            issues,
        };
    }

    return {
        valid: true,
        data: {
            phone,
            firstName: firstName || null,
            lastName: lastName || null,
            address,
        },
        issues,
    };
}