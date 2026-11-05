import type {
    PreparedDraftOrders,
} from "./prepare-draft-orders";
import type {
    buildCustomerImportPlan,
} from "./build-customer-import-plan";
import type {
    buildProductImportPlan,
} from "./build-product-import-plan";

export type ImportCategoryStatus = {
    // გადმოსატანად მზად.
    ready: number;
    // მომხმარებლის არჩევანს ან შესწორებას საჭიროებს.
    attention: number;
    // არ გადმოვა: გაუქმებული, დაბრუნებული ან გამოტოვებული.
    skipped: number;
    // სერვერზე არსებულ მონაცემებთან შედარებას ელოდება.
    waiting: number;
    // გასასწორებელი ჩანაწერების გასაღებები ერთიანი გამოტოვებისთვის.
    attentionKeys: string[];
};

export function summarizeOrderCategory(
    result: PreparedDraftOrders,
    confirmations: readonly string[],
): ImportCategoryStatus {
    const confirmed = new Set(confirmations);

    const unconfirmed = result.orders.filter(order =>
        order.result.kind === "PREVIEW_READY" &&
        order.confirmationToken !== null &&
        !confirmed.has(order.confirmationToken),
    );

    const review = result.orders.filter(
        order => order.result.kind === "NEEDS_REVIEW",
    );

    return {
        ready: result.summary.previewReadyCount - unconfirmed.length,
        attention:
            review.length +
            unconfirmed.length +
            result.groupingProblems.length +
            result.mappingProblems.length,
        skipped:
            result.summary.skippedCount +
            result.summary.excludedRowCount,
        waiting: 0,
        attentionKeys: [
            ...review.flatMap(order =>
                order.group.rows.map(row => row.key),
            ),
            ...result.groupingProblems.map(problem => problem.rowKey),
        ],
    };
}

export function summarizeCustomerCategory(
    plan: ReturnType<typeof buildCustomerImportPlan>,
    excludedCount: number,
): ImportCategoryStatus {
    const blocked = plan.items.filter(
        item =>
            item.action === "BLOCKED" &&
            item.reasonCode !== "WAITING_FOR_CHECK",
    );

    return {
        ready: plan.createCount + plan.linkCount,
        attention: blocked.length,
        skipped: excludedCount,
        waiting: plan.items.filter(
            item => item.reasonCode === "WAITING_FOR_CHECK",
        ).length,
        attentionKeys: blocked.map(item => item.record.key),
    };
}

export function summarizeProductCategory(
    plan: ReturnType<typeof buildProductImportPlan>,
    excludedCount: number,
): ImportCategoryStatus {
    // მარაგის თარიღი და წესი ერთხელ ირჩევა და ჩანაწერის
    // გამოტოვებით არ წყდება, ამიტომ ერთ კითხვად ითვლება.
    const rowProblems = plan.problems.filter(item =>
        item.reasonCode !== "STOCK_DATE" &&
        item.reasonCode !== "STOCK_POLICY",
    );

    return {
        ready: plan.createCount + plan.linkCount,
        attention:
            rowProblems.length +
            (rowProblems.length < plan.problems.length ? 1 : 0),
        skipped: excludedCount,
        waiting: plan.waitingCount,
        attentionKeys: rowProblems.map(item => item.record.key),
    };
}
