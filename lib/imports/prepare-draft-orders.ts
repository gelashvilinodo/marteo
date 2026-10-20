import {
    prepareDraftOrderRows,
    type OrderDraftFile,
    type PreparedOrderSourceRow,
    type OrderSourceProblem,
} from "./prepare-draft-order-rows";
import {
    prepareOrderGrouping,
} from "./prepare-order-grouping";
import {
    prepareImportOrderGroup,
    type PreparedOrderGroupResult,
} from "./prepare-import-order-group";
import {
    createOrderImportOptions,
    validateOrderImportOptions,
} from "./order-import-options";
import type {
    ImportedOrderGroup,
    OrderGroupingProblem,
} from "./group-import-order-rows";
import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";
import {
    getOrderGroupingConfirmationToken,
    validateOrderGroupingConfirmations,
} from "./order-grouping-confirmations";

export type PreparedDraftOrder = {
    group: ImportedOrderGroup;
    confirmationToken: string | null;
    groupingConfirmed: boolean;
    fileName: string;
    result: PreparedOrderGroupResult;
};

export type PreparedDraftOrders = {
    orders: PreparedDraftOrder[];
    sourceRows: Map<string, PreparedOrderSourceRow>;
    excludedRows: PreparedOrderSourceRow[];
    mappingProblems: OrderSourceProblem[];
    groupingProblems: OrderGroupingProblem[];
    summary: {
        totalGroups: number;
        previewReadyCount: number;
        reviewCount: number;
        skippedCount: number;
        excludedRowCount: number;
        groupingProblemRowCount: number;
        unknownCostOrderCount: number;
        incompleteContactOrderCount: number;
        confirmationRequiredCount: number;
    };
};

export function prepareDraftOrders(input: {
    files: readonly OrderDraftFile[];
    settings: ImportDraftSettings;
}): PreparedDraftOrders {
    const options = validateOrderImportOptions(
        input.settings.orderOptions ??
        createOrderImportOptions(),
    );

    const prepared = prepareDraftOrderRows(input);

    const confirmations = new Set(
        validateOrderGroupingConfirmations(
            input.settings.orderGroupingConfirmations,
        ),
    );

    const fileHashes = new Map(
        input.files.map(item => [
            item.clientFileId,
            item.file.sha256,
        ]),
    );

    const grouped = prepareOrderGrouping({
        rows: prepared.rows,
        options,
    });

    const orders: PreparedDraftOrder[] = grouped.groups.map(group => {
        const rows = group.rows.map(reference => {
            const row = grouped.sourceRows.get(reference.key);

            if (!row) {
                throw new Error(
                    "შეკვეთის ჯგუფის საწყისი რიგი ვერ მოიძებნა.",
                );
            }

            return row;
        });

        const confirmationToken = group.requiresConfirmation
            ? getOrderGroupingConfirmationToken({
                group,
                fileSha256:
                    fileHashes.get(rows[0].fileId) ?? "",
            })
            : null;

        return {
            group,
            confirmationToken,
            groupingConfirmed:
                confirmationToken === null ||
                confirmations.has(confirmationToken),
            fileName: rows[0]?.fileName ?? "",
            result: prepareImportOrderGroup({
                rows,
                options,
            }),
        };
    });

    const ready = orders.filter(
        order => order.result.kind === "PREVIEW_READY",
    );

    return {
        orders,
        sourceRows: grouped.sourceRows,
        excludedRows: prepared.excludedRows,
        mappingProblems: prepared.mappingProblems,
        groupingProblems: grouped.problems,
        summary: {
            totalGroups: orders.length,
            previewReadyCount: ready.length,
            reviewCount: orders.filter(
                order => order.result.kind === "NEEDS_REVIEW",
            ).length,
            skippedCount: orders.filter(
                order => order.result.kind === "SKIPPED",
            ).length,
            excludedRowCount: prepared.excludedRows.length,
            groupingProblemRowCount: new Set(
                grouped.problems.map(problem => problem.rowKey),
            ).size,
            unknownCostOrderCount: ready.filter(
                order =>
                    order.result.kind === "PREVIEW_READY" &&
                    !order.result.data.costComplete,
            ).length,
            incompleteContactOrderCount: ready.filter(
                order =>
                    order.result.kind === "PREVIEW_READY" &&
                    !order.result.data.contact.canCreateCustomer,
            ).length,
            confirmationRequiredCount: ready.filter(
                order =>
                    order.group.requiresConfirmation &&
                    !order.groupingConfirmed,
            ).length,
        },
    };
}