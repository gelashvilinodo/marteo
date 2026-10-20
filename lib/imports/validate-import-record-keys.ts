import { ImportDraftFileError } from "./validate-import-draft-file";

export function validateImportRecordKeys(
    value: unknown,
    label: string,
): string[] {
    function fail(): never {
        throw new ImportDraftFileError(
            `${label}: გამოტოვებული ჩანაწერების იდენტიფიკატორები არასწორია.`,
        );
    }

    if (!Array.isArray(value)) fail();

    return [...new Set(
        value.map((key: unknown) => {
            if (typeof key !== "string") fail();

            let parts: unknown;

            try {
                parts = JSON.parse(key) as unknown;
            } catch {
                fail();
            }

            if (
                !Array.isArray(parts) ||
                parts.length !== 3 ||
                typeof parts[0] !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parts[0]) ||
                typeof parts[1] !== "string" ||
                !parts[1].trim() ||
                typeof parts[2] !== "number" ||
                !Number.isSafeInteger(parts[2]) ||
                parts[2] < 1 ||
                JSON.stringify(parts) !== key
            ) {
                fail();
            }

            return key;
        }),
    )];
}