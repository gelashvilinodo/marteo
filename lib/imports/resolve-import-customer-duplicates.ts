import type {
    PreparedImportCustomer,
} from "./prepare-import-customers";

export type CustomerDuplicateDecision = {
    groupToken: string;
    keepKey: string;
};

export type ResolvedImportCustomer = Omit<
    PreparedImportCustomer,
    "status"
> & {
    status: PreparedImportCustomer["status"] | "SKIPPED";
    linkedToKey: string | null;
};

export type CustomerDuplicateResolution = {
    records: ResolvedImportCustomer[];
    appliedDecisions: CustomerDuplicateDecision[];
    ignoredDecisions: CustomerDuplicateDecision[];
};

/**
 * გადაწყვეტილება მოქმედებს მხოლოდ იმ მონაცემებზე,
 * რომლებიც მომხმარებელმა არჩევის დროს ნახა.
 *
 * ნომრის, მისამართის, სახელის ან ჯგუფის წევრების
 * ცვლილებისას ძველი არჩევანი ხელახლა დასადასტურებელია.
 */
export function getCustomerDuplicateGroupToken(
    group: readonly Pick<
        PreparedImportCustomer,
        "key" | "sourceCode" | "data"
    >[],
): string {
    return JSON.stringify(
        [...group]
            .sort((left, right) =>
                left.key < right.key
                    ? -1
                    : left.key > right.key
                        ? 1
                        : 0,
            )
            .map(record => ({
                key: record.key,
                sourceCode: record.sourceCode,
                data: record.data,
            })),
    );
}

export function resolveImportCustomerDuplicates(
    input: readonly PreparedImportCustomer[],
    decisions: readonly CustomerDuplicateDecision[],
): CustomerDuplicateResolution {
    const records: ResolvedImportCustomer[] = input.map(record => ({
        ...record,
        issues: [...record.issues],
        duplicateKeys: [...record.duplicateKeys],
        linkedToKey: null,
    }));

    const byKey = new Map(
        records.map(record => [record.key, record]),
    );

    const appliedDecisions: CustomerDuplicateDecision[] = [];
    const ignoredDecisions: CustomerDuplicateDecision[] = [];
    const handledGroups = new Set<string>();

    for (const decision of decisions) {
        const keep = byKey.get(decision.keepKey);

        if (
            !keep ||
            !keep.data ||
            keep.status !== "NEEDS_REVIEW"
        ) {
            ignoredDecisions.push(decision);
            continue;
        }

        const groupKeys = new Set([
            keep.key,
            ...keep.duplicateKeys,
        ]);

        const group = [...groupKeys].flatMap(key => {
            const record = byKey.get(key);

            return record ? [record] : [];
        });

        const validGroup =
            group.length > 1 &&
            group.length === groupKeys.size &&
            group.every(record =>
                record.status === "NEEDS_REVIEW" &&
                record.data?.phone === keep.data?.phone &&
                !record.issues.some(
                    issue => issue.severity === "ERROR",
                ) &&
                record.duplicateKeys.length === group.length - 1 &&
                record.duplicateKeys.every(key =>
                    key !== record.key && groupKeys.has(key),
                ),
            );

        if (!validGroup) {
            ignoredDecisions.push(decision);
            continue;
        }

        const token = getCustomerDuplicateGroupToken(group);

        if (
            token !== decision.groupToken ||
            handledGroups.has(token)
        ) {
            ignoredDecisions.push(decision);
            continue;
        }

        handledGroups.add(token);

        for (const record of group) {
            record.issues = record.issues.filter(
                issue =>
                    issue.code !== "DUPLICATE_PHONE_IN_IMPORT",
            );

            if (record.key === keep.key) {
                record.status = "READY";
                continue;
            }

            record.status = "SKIPPED";
            record.linkedToKey = keep.key;

            record.issues.push({
                severity: "WARNING",
                code: "DUPLICATE_LINKED_TO_SELECTED_CUSTOMER",
                field: "phone",
                message:
                    "ცალკე მომხმარებლად არ დაემატება. ეს წყაროს ჩანაწერი დაკავშირებულია შენ მიერ არჩეულ მომხმარებელთან. მისი მონაცემები არჩეული მომხმარებლის ველებს ავტომატურად არ გადააწერს.",
            });
        }

        appliedDecisions.push(decision);
    }

    return {
        records,
        appliedDecisions,
        ignoredDecisions,
    };
}