export type OrderGroupValueResult =
    | {
        kind: "READY";
        value: string;
        sourceRowNumbers: number[];
    }
    | {
        kind: "MISSING";
        value: null;
    }
    | {
        kind: "NEEDS_REVIEW";
        value: null;
        message: string;
        conflicts: {
            value: string;
            rowNumbers: number[];
        }[];
    };

// მნიშვნელობები გადმოეცემა მხოლოდ მათი შესაბამისი
// შემოწმებისა და ნორმალიზების შემდეგ.
// მაგალითად: თანხები "80.00", თარიღები "2026-10-18".
export function resolveOrderGroupValue(input: {
    label: string;
    values: readonly {
        rowNumber: number;
        value: string | null;
    }[];
}): OrderGroupValueResult {
    const found = new Map<string, Set<number>>();

    for (const item of input.values) {
        if (
            !Number.isSafeInteger(item.rowNumber) ||
            item.rowNumber < 1
        ) {
            throw new Error(
                "შეკვეთის ჯგუფში წყაროს რიგის ნომერი არასწორია.",
            );
        }

        if (item.value === null) continue;

        if (typeof item.value !== "string") {
            throw new Error(
                "შეკვეთის ჯგუფს გადაეცა შეუმოწმებელი მნიშვნელობა.",
            );
        }

        const value = item.value.normalize("NFC").trim();

        if (!value) continue;

        const rowNumbers = found.get(value) ?? new Set<number>();

        rowNumbers.add(item.rowNumber);
        found.set(value, rowNumbers);
    }

    if (found.size === 0) {
        return {
            kind: "MISSING",
            value: null,
        };
    }

    const entries = [...found.entries()].map(
        ([value, rowNumbers]) => ({
            value,
            rowNumbers: [...rowNumbers].sort((a, b) => a - b),
        }),
    );

    if (entries.length === 1) {
        return {
            kind: "READY",
            value: entries[0].value,
            sourceRowNumbers: entries[0].rowNumbers,
        };
    }

    return {
        kind: "NEEDS_REVIEW",
        value: null,
        message:
            `${input.label}: ერთ შეკვეთად დაჯგუფებულ რიგებში ` +
            "განსხვავებული მნიშვნელობებია. გადაამოწმე, ეს რიგები " +
            "მართლაც ერთ შეკვეთას ეკუთვნის თუ არა, ან შეასწორე მონაცემები. " +
            "არც ერთ მნიშვნელობას ავტომატურად არ ავირჩევთ.",
        conflicts: entries,
    };
}