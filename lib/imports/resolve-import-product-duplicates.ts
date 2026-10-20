import type {
    PreparedImportProduct,
} from "./prepare-import-products";

export type ProductDuplicateDecision =
    | {
        groupToken: string;
        action: "KEEP_ONE";
        keepKey: string;
    }
    | {
        groupToken: string;
        action: "KEEP_SEPARATE";
    };

export function getProductDuplicateGroupToken(
    group: readonly PreparedImportProduct[],
): string {
    return JSON.stringify(
        [...group]
            .sort((left, right) =>
                left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
            )
            .map(record => ({
                key: record.key,
                mode: record.mode,
                data: record.data,
            })),
    );
}

export function getProductDuplicateGroups(
    records: readonly PreparedImportProduct[],
): PreparedImportProduct[][] {
    const byKey = new Map(
        records.map(record => [record.key, record]),
    );

    const visited = new Set<string>();
    const groups: PreparedImportProduct[][] = [];

    for (const record of records) {
        if (
            record.status !== "NEEDS_REVIEW" ||
            visited.has(record.key)
        ) {
            continue;
        }

        const pending = [record.key];
        const group: PreparedImportProduct[] = [];

        while (pending.length > 0) {
            const key = pending.pop();

            if (!key || visited.has(key)) continue;

            const item = byKey.get(key);

            if (!item || item.status !== "NEEDS_REVIEW") continue;

            visited.add(key);
            group.push(item);
            pending.push(...item.duplicateKeys);
        }

        if (group.length > 1) groups.push(group);
    }

    return groups;
}

export function resolveImportProductDuplicates({
    records: input,
    decisions,
}: {
    records: readonly PreparedImportProduct[];
    decisions: readonly ProductDuplicateDecision[];
}): {
    records: PreparedImportProduct[];
    omittedDuplicates: PreparedImportProduct[];
    aliases: Record<string, string>;
    appliedDecisions: ProductDuplicateDecision[];
    staleDecisions: ProductDuplicateDecision[];
} {
    const records = input.map(record => ({
        ...record,
        issues: [...record.issues],
        duplicateKeys: [...record.duplicateKeys],
    }));

    const groups = getProductDuplicateGroups(records);
    const omitted = new Set<string>();
    const aliases = new Map<string, string>();
    const applied = new Set<ProductDuplicateDecision>();

    function markResolved(record: PreparedImportProduct) {
        record.status = "READY";
        record.duplicateKeys = [];

        record.issues = record.issues.filter(
            issue =>
                issue.code !== "REPEATED_PRODUCT_CODE" &&
                issue.code !== "SIMILAR_PRODUCT",
        );
    }

    for (const group of groups) {
        if (group.some(record => record.data === null)) continue;

        const token = getProductDuplicateGroupToken(group);

        const matching = decisions.filter(
            decision => decision.groupToken === token,
        );

        // წინააღმდეგობრივი არჩევანი ავტომატურად არ გადაწყდეს.
        if (matching.length !== 1) continue;

        const decision = matching[0];

        if (decision.action === "KEEP_SEPARATE") {
            for (const record of group) {
                markResolved(record);
            }

            applied.add(decision);
            continue;
        }

        const keep = group.find(
            record => record.key === decision.keepKey,
        );

        if (!keep) continue;

        markResolved(keep);

        for (const record of group) {
            if (record.key === keep.key) continue;

            omitted.add(record.key);
            aliases.set(record.key, keep.key);
        }

        applied.add(decision);
    }

    return {
        records: records.filter(record => !omitted.has(record.key)),
        omittedDuplicates: records.filter(
            record => omitted.has(record.key),
        ),
        aliases: Object.fromEntries(aliases),
        appliedDecisions: decisions.filter(
            decision => applied.has(decision),
        ),
        staleDecisions: decisions.filter(
            decision => !applied.has(decision),
        ),
    };
}