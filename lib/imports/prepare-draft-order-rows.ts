import type {
    ParsedImportFile,
} from "./import-file-types";
import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";
import {
    readImportOrderRows,
    type ReadImportOrderRow,
} from "./read-import-order-rows";

export type OrderDraftFile = {
    clientFileId: string;
    file: ParsedImportFile;
};

export type PreparedOrderSourceRow = ReadImportOrderRow & {
    decimalSeparator: "." | ",";
    excelDateSystem: ParsedImportFile["excelDateSystem"];
    orderTotalIncludesCourier?: boolean;
    paidAmountIncludesCourier?: boolean;
};

export type OrderSourceProblem = {
    fileId: string;
    fileName: string;
    sheetName: string;
    message: string;
};

export function prepareDraftOrderRows(input: {
    files: readonly OrderDraftFile[];
    settings: ImportDraftSettings;
}): {
    rows: PreparedOrderSourceRow[];
    excludedRows: PreparedOrderSourceRow[];
    mappingProblems: OrderSourceProblem[];
} {
    const files = new Map<string, OrderDraftFile>();

    for (const item of input.files) {
        if (files.has(item.clientFileId)) {
            throw new Error(
                "შეკვეთების იმპორტში წყაროს ფაილის კოდი მეორდება.",
            );
        }

        files.set(item.clientFileId, item);
    }

    const excluded = new Set(
        input.settings.excludedOrderKeys ?? [],
    );

    const rows: PreparedOrderSourceRow[] = [];
    const excludedRows: PreparedOrderSourceRow[] = [];
    const mappingProblems: OrderSourceProblem[] = [];

    for (const [fileId, mappings] of Object.entries(
        input.settings.orderMappings ?? {},
    )) {
        for (const [sheetName, mapping] of Object.entries(mappings)) {
            if (!mapping.enabled) continue;

            const entry = files.get(fileId);
            const sheet = entry?.file.sheets.find(
                item => item.name === sheetName,
            );

            if (!entry || !sheet) {
                mappingProblems.push({
                    fileId,
                    fileName: entry?.file.originalName ?? fileId,
                    sheetName,
                    message:
                        "შეკვეთებისთვის მონიშნული წყაროს ფაილი ან ფურცელი " +
                        "მონახაზში ვერ მოიძებნა. ხელახლა აირჩიე შესაბამისი " +
                        "ფურცელი ან მოხსენი ამ წყაროდან შეკვეთების გადმოტანა.",
                });
                continue;
            }

            const result = readImportOrderRows({
                fileId,
                fileName: entry.file.originalName,
                sheet,
                mapping,
                edits:
                    input.settings.orderEdits?.[fileId]?.[sheetName] ??
                    {},
            });

            for (const message of result.mappingProblems) {
                mappingProblems.push({
                    fileId,
                    fileName: entry.file.originalName,
                    sheetName,
                    message,
                });
            }

            for (const row of result.rows) {
                const prepared: PreparedOrderSourceRow = {
                    ...row,
                    decimalSeparator: mapping.decimalSeparator,
                    excelDateSystem: entry.file.excelDateSystem,
                    orderTotalIncludesCourier:
                        mapping.orderTotalIncludesCourier === true,
                    paidAmountIncludesCourier:
                        mapping.paidAmountIncludesCourier === true,
                };

                if (excluded.has(row.key)) {
                    excludedRows.push(prepared);
                } else {
                    rows.push(prepared);
                }
            }
        }
    }

    return {
        rows,
        excludedRows,
        mappingProblems,
    };
}