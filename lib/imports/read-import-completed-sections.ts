export type ImportCompletedSections = {
    customers: boolean;
    products: boolean;
    orders: boolean;
};

function object(
    value: unknown,
): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error(
            "იმპორტის შესრულების შედეგის ფორმატი არასწორია.",
        );
    }

    return value as Record<string, unknown>;
}

export function readImportCompletedSections(
    raw: unknown,
    context: {
        draftId: string;
        businessId: string;
        revision: number;
    },
): ImportCompletedSections {
    if (
        !Number.isSafeInteger(context.revision) ||
        context.revision < 1
    ) {
        throw new Error(
            "იმპორტის მიმდინარე ვერსია არასწორია.",
        );
    }

    const summary = raw === null || raw === undefined
        ? {}
        : object(raw);

    function completed(
        section: "customers" | "products" | "orders",
    ): boolean {
        if (summary[section] === undefined) return false;

        const receipt = object(summary[section]);

        if (
            receipt.version !== 1 ||
            receipt.draftId !== context.draftId ||
            receipt.businessId !== context.businessId ||
            typeof receipt.sourceRevision !== "number" ||
            !Number.isSafeInteger(receipt.sourceRevision) ||
            receipt.sourceRevision < 1 ||
            receipt.sourceRevision >= context.revision ||
            typeof receipt.completedAt !== "string" ||
            !Number.isFinite(Date.parse(receipt.completedAt)) ||
            typeof receipt.pendingOtherSections !== "boolean"
        ) {
            throw new Error(
                "იმპორტის შესრულებული განყოფილება ვერ დადასტურდა.",
            );
        }

        for (const field of [
            "totalCount",
            "createdCount",
            "linkedCount",
            "excludedCount",
        ]) {
            const value = receipt[field];

            if (
                typeof value !== "number" ||
                !Number.isSafeInteger(value) ||
                value < 0
            ) {
                throw new Error(
                    "იმპორტის შესრულების რაოდენობები არასწორია.",
                );
            }
        }

        if (
            Number(receipt.createdCount) +
            Number(receipt.linkedCount) !==
            receipt.totalCount
        ) {
            throw new Error(
                "იმპორტის შესრულების რაოდენობები არ ემთხვევა.",
            );
        }

        return true;
    }

    return {
        customers: completed("customers"),
        products: completed("products"),
        orders: completed("orders"),
    };
}