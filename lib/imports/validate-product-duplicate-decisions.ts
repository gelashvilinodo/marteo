import type {
    ProductDuplicateDecision,
} from "./resolve-import-product-duplicates";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";
import {
    validateImportRecordKeys,
} from "./validate-import-record-keys";

function fail(message: string): never {
    throw new ImportDraftFileError(
        `პროდუქტების განმეორების არჩევანი: ${message}`,
    );
}

function readObject(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail("ჩანაწერის ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

export function getProductDuplicateDecisionKeys(
    groupToken: string,
): string[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(groupToken);
    } catch {
        fail("ჯგუფის მონაცემები დაზიანებულია.");
    }

    if (!Array.isArray(parsed) || parsed.length < 2) {
        fail("ჯგუფში სულ მცირე ორი ჩანაწერი უნდა იყოს.");
    }

    const entries = parsed.map(value => {
        const entry = readObject(value);

        if (
            typeof entry.key !== "string" ||
            (
                entry.mode !== "CATALOG" &&
                entry.mode !== "CURRENT_STOCK"
            )
        ) {
            fail("ჯგუფის ჩანაწერის მონაცემები არასწორია.");
        }

        readObject(entry.data);

        return {
            key: entry.key,
            mode: entry.mode,
            data: entry.data,
        };
    });

    const keys = validateImportRecordKeys(
        entries.map(entry => entry.key),
        "განმეორებული პროდუქტების რიგები",
    );

    if (keys.length !== entries.length) {
        fail("ჯგუფში ერთი და იგივე რიგი მეორდება.");
    }

    const canonicalToken = JSON.stringify(
        [...entries].sort((left, right) =>
            left.key < right.key
                ? -1
                : left.key > right.key
                    ? 1
                    : 0,
        ),
    );

    if (canonicalToken !== groupToken) {
        fail("ჯგუფის ფორმატი არასწორია.");
    }

    return keys;
}

export function validateProductDuplicateDecisions(
    value: unknown,
): ProductDuplicateDecision[] {
    if (value === undefined) return [];

    if (!Array.isArray(value)) {
        fail("მოსალოდნელია არჩევანების სია.");
    }

    const seenTokens = new Set<string>();

    return value.map((raw): ProductDuplicateDecision => {
        const item = readObject(raw);

        if (
            typeof item.groupToken !== "string" ||
            !item.groupToken
        ) {
            fail("ჯგუფის იდენტიფიკატორი აკლია.");
        }

        if (seenTokens.has(item.groupToken)) {
            fail("ერთ ჯგუფზე რამდენიმე არჩევანია შენახული.");
        }

        seenTokens.add(item.groupToken);

        const keys = getProductDuplicateDecisionKeys(
            item.groupToken,
        );

        if (item.action === "KEEP_SEPARATE") {
            return {
                groupToken: item.groupToken,
                action: "KEEP_SEPARATE",
            };
        }

        if (item.action === "KEEP_ONE") {
            if (
                typeof item.keepKey !== "string" ||
                !keys.includes(item.keepKey)
            ) {
                fail("დატოვებული ჩანაწერი ამ ჯგუფში არ არის.");
            }

            return {
                groupToken: item.groupToken,
                action: "KEEP_ONE",
                keepKey: item.keepKey,
            };
        }

        fail("არჩევანის ტიპი უცნობია.");
    });
}