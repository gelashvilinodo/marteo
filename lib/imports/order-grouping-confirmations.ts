import type {
    ImportedOrderGroup,
} from "./group-import-order-rows";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export function getOrderGroupingConfirmationToken(input: {
    group: ImportedOrderGroup;
    fileSha256: string;
}): string {
    if (!/^[a-f0-9]{64}$/i.test(input.fileSha256)) {
        throw new Error(
            "დაჯგუფების დასადასტურებლად წყაროს ფაილი ვერ დადასტურდა.",
        );
    }

    const rowKeys = input.group.rows
        .map(row => row.key)
        .sort();

    if (
        rowKeys.length === 0 ||
        new Set(rowKeys).size !== rowKeys.length
    ) {
        throw new Error(
            "დაჯგუფების დასადასტურებელი რიგები არასწორია.",
        );
    }

    return JSON.stringify([
        1,
        input.fileSha256.toLowerCase(),
        input.group.key,
        rowKeys,
    ]);
}

export function validateOrderGroupingConfirmations(
    value: unknown,
): string[] {
    if (value === undefined) return [];

    function fail(): never {
        throw new ImportDraftFileError(
            "შეკვეთების დაჯგუფების დადასტურებების სტრუქტურა არასწორია. მონაცემები არ შენახულა.",
        );
    }

    if (!Array.isArray(value)) fail();

    const tokens: string[] = [];

    for (const token of value) {
        if (typeof token !== "string") fail();

        let parsed: unknown;

        try {
            parsed = JSON.parse(token);
        } catch {
            fail();
        }

        if (
            !Array.isArray(parsed) ||
            parsed.length !== 4 ||
            parsed[0] !== 1 ||
            typeof parsed[1] !== "string" ||
            !/^[a-f0-9]{64}$/.test(parsed[1]) ||
            typeof parsed[2] !== "string" ||
            !parsed[2] ||
            !Array.isArray(parsed[3]) ||
            parsed[3].length === 0
        ) {
            fail();
        }

        const rawKeys: unknown[] = parsed[3];
        const keys: string[] = [];

        for (const key of rawKeys) {
            if (typeof key !== "string" || !key) fail();
            keys.push(key);
        }

        if (new Set(keys).size !== keys.length) fail();

        const canonical = JSON.stringify([
            1,
            parsed[1],
            parsed[2],
            [...keys].sort(),
        ]);

        if (token !== canonical) fail();

        tokens.push(canonical);
    }

    return [...new Set(tokens)];
}