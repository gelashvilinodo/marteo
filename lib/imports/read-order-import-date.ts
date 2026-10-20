import {
    validateImportDate,
} from "./validate-import-date";
import type {
    ParsedImportFile,
} from "./import-file-types";

export type OrderDateReadResult =
    | {
        kind: "READY";
        date: string;
        usedFallback: boolean;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

export function readOrderImportDate(input: {
    value: unknown;
    fallbackDate: string | null;
    textOrder: "DMY" | "MDY" | null;
    excelDateSystem: ParsedImportFile["excelDateSystem"];
}): OrderDateReadResult {
    const missing =
        input.value === null ||
        input.value === undefined ||
        (
            typeof input.value === "string" &&
            input.value.trim() === ""
        );

    if (missing && input.fallbackDate === null) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "შეკვეთის თარიღი მითითებული არ არის. " +
                "შეგიძლია მიუთითო საერთო თარიღი, ჯგუფის თარიღი " +
                "ან შეავსო ამ შეკვეთის თარიღი.",
        };
    }

    const result = validateImportDate(
        missing ? input.fallbackDate : input.value,
        {
            field: "date",
            label: "შეკვეთის თარიღი",
            textOrder: input.textOrder ?? undefined,
            excelDateSystem: input.excelDateSystem ?? undefined,
        },
    );

    if (!result.valid) {
        return {
            kind: "NEEDS_REVIEW",
            message: result.issues
                .map(issue => issue.message)
                .join(" "),
        };
    }

    return {
        kind: "READY",
        date: result.data,
        usedFallback: missing,
    };
}