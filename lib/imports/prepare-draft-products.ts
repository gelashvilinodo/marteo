import type {
    ParsedImportFile,
} from "./import-file-types";
import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";
import {
    prepareImportProducts,
    type ProductImportSource,
} from "./prepare-import-products";
import {
    resolveImportProductDuplicates,
} from "./resolve-import-product-duplicates";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export type ProductDraftFile = {
    clientFileId: string;
    file: ParsedImportFile;
};

export function prepareDraftProducts({
    files,
    settings,
}: {
    files: readonly ProductDraftFile[];
    settings: ImportDraftSettings;
}) {
    const filesById = new Map<string, ParsedImportFile>();

    for (const entry of files) {
        if (filesById.has(entry.clientFileId)) {
            throw new ImportDraftFileError(
                "მონახაზში ფაილის სამუშაო იდენტიფიკატორი მეორდება.",
            );
        }

        filesById.set(entry.clientFileId, entry.file);
    }

    const sources: ProductImportSource[] = [];

    for (const [fileId, sheetMappings] of Object.entries(
        settings.productMappings,
    )) {
        for (const [sheetName, mapping] of Object.entries(
            sheetMappings,
        )) {
            if (!mapping.enabled) continue;

            const file = filesById.get(fileId);

            if (!file) {
                throw new ImportDraftFileError(
                    `პროდუქტებისთვის არჩეული ფაილი ვერ მოიძებნა. ხელახლა გახსენი მონახაზი და გადაამოწმე ფურცლების არჩევანი.`,
                );
            }

            const sheet = file.sheets.find(
                item => item.name === sheetName,
            );

            if (!sheet) {
                throw new ImportDraftFileError(
                    `ფაილში „${file.originalName}“ პროდუქტებისთვის არჩეული ფურცელი „${sheetName}“ ვერ მოიძებნა.`,
                );
            }

            sources.push({
                fileId,
                fileName: file.originalName,
                sheet,
                mapping,
                edits:
                    settings.productEdits[fileId]?.[sheetName] ??
                    {},
            });
        }
    }

    const prepared = prepareImportProducts(
        sources,
        settings.excludedProductKeys,
    );

    const resolved = resolveImportProductDuplicates({
        records: prepared.records,
        decisions: settings.productDuplicateDecisions,
    });

    const allPrepared =
        settings.excludedProductKeys.length > 0
            ? prepareImportProducts(sources).records
            : prepared.records;

    const excludedKeys = new Set(
        settings.excludedProductKeys,
    );

    const excludedRecords = allPrepared.filter(
        record => excludedKeys.has(record.key),
    );

    return {
        sources,
        preparedRecords: prepared.records,
        records: resolved.records,
        mappingProblems: prepared.mappingProblems,
        excludedRecords,
        omittedDuplicates: resolved.omittedDuplicates,
        aliases: resolved.aliases,
        appliedDuplicateDecisions: resolved.appliedDecisions,
        staleDuplicateDecisions: resolved.staleDecisions,
    };
}