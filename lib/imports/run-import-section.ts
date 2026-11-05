import type {
    ImportCategory,
} from "./discover-import-sources";

export type ImportSectionCheck = {
    canImport: boolean;
    problems: string[];
};

export type ImportSectionReceipt = {
    // ბიზნესში დამატებული ან არსებულთან დაკავშირებული ჩანაწერები.
    savedCount: number;
    // ჩანაწერები, რომლებიც არ გადმოვიდა (გაუქმებული, გამოტოვებული).
    skippedCount: number;
};

// პასუხი, რომლის შედეგიც უცნობია: ხელახლა ცდა უსაფრთხოა,
// რადგან სერვერი უკვე შესრულებულ ნაბიჯს არ იმეორებს.
export class ImportSectionUncertainError extends Error {}

const paths: Record<ImportCategory, string> = {
    customers: "customers",
    products: "products",
    orders: "orders",
};

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new ImportSectionUncertainError(
            "სერვერის პასუხი ვერ წავიკითხეთ.",
        );
    }

    return value as Record<string, unknown>;
}

function count(value: unknown): number {
    return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
        ? value
        : 0;
}

async function post(
    url: string,
    body: unknown,
): Promise<Record<string, unknown>> {
    let response: Response;

    try {
        response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch {
        throw new ImportSectionUncertainError(
            "ინტერნეტთან კავშირი გაწყდა.",
        );
    }

    let result: Record<string, unknown>;

    try {
        result = object(await response.json());
    } catch {
        throw new ImportSectionUncertainError(
            "სერვერის პასუხი ვერ წავიკითხეთ.",
        );
    }

    if (!response.ok || result.success !== true) {
        const message = typeof result.message === "string"
            ? result.message
            : "მოთხოვნა ვერ შესრულდა.";

        // 4xx ნიშნავს, რომ სერვერმა არაფერი შეცვალა.
        if (response.status >= 400 && response.status < 500) {
            throw new Error(message);
        }

        throw new ImportSectionUncertainError(message);
    }

    return result;
}

function problemText(raw: unknown): string {
    if (typeof raw === "string") return raw;

    const problem = object(raw);
    const row = typeof problem.rowNumber === "number"
        ? `რიგი ${problem.rowNumber}: `
        : "";

    return `${row}${String(problem.message ?? "")}`;
}

export async function checkImportSection(input: {
    draftId: string;
    revision: number;
    category: ImportCategory;
}): Promise<ImportSectionCheck> {
    const body = await post(
        `/api/imports/drafts/${encodeURIComponent(input.draftId)}/${paths[input.category]}/check`,
        { expectedRevision: input.revision },
    );

    if (
        body.draftId !== input.draftId ||
        body.revision !== input.revision ||
        typeof body.finalImportAvailable !== "boolean"
    ) {
        throw new Error(
            "მონაცემები შეიცვალა. დააჭირეთ ღილაკს ხელახლა.",
        );
    }

    const problems = [
        ...(Array.isArray(body.mappingProblems) ? body.mappingProblems : []),
        ...(Array.isArray(body.problems) ? body.problems : []),
    ].map(problemText);

    return {
        canImport: body.finalImportAvailable && problems.length === 0,
        problems,
    };
}

export async function executeImportSection(input: {
    draftId: string;
    revision: number;
    category: ImportCategory;
}): Promise<ImportSectionReceipt> {
    const body = await post(
        `/api/imports/drafts/${encodeURIComponent(input.draftId)}/${paths[input.category]}/execute`,
        { expectedRevision: input.revision, confirmed: true },
    );

    const receipt = object(body.receipt);

    if (
        receipt.draftId !== input.draftId ||
        receipt.sourceRevision !== input.revision
    ) {
        throw new ImportSectionUncertainError(
            "შენახული ვერსია პასუხში ვერ დადასტურდა.",
        );
    }

    return {
        savedCount:
            count(receipt.createdCount) + count(receipt.linkedCount),
        skippedCount:
            count(receipt.excludedCount) +
            count(receipt.skippedCount) +
            count(receipt.omittedDuplicateCount),
    };
}
