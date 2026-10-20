import type {
    ParsedImportFile,
} from "./import-file-types";

import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";

import {
    prepareImportCustomers,
    type CustomerImportSource,
} from "./prepare-import-customers";

import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export type CustomerDraftFile = {
    clientFileId: string;
    file: ParsedImportFile;
};

export function prepareDraftCustomers({
    files,
    settings,
}: {
    files: readonly CustomerDraftFile[];
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

    const sources: CustomerImportSource[] = [];

    for (const [fileId, sheetMappings] of Object.entries(
        settings.customerMappings,
    )) {
        for (const [sheetName, mapping] of Object.entries(
            sheetMappings,
        )) {
            if (!mapping.enabled) continue;

            const file = filesById.get(fileId);

            if (!file) {
                throw new ImportDraftFileError(
                    "მომხმარებლებისთვის არჩეული ფაილი ვერ მოიძებნა. ხელახლა გახსენი მონახაზი და გადაამოწმე ფურცლების არჩევანი.",
                );
            }

            const sheet = file.sheets.find(
                item => item.name === sheetName,
            );

            if (!sheet) {
                throw new ImportDraftFileError(
                    `ფაილში „${file.originalName}“ მომხმარებლებისთვის არჩეული ფურცელი „${sheetName}“ ვერ მოიძებნა.`,
                );
            }

            sources.push({
                fileId,
                fileName: file.originalName,
                sheet,
                mapping: {
                    ...mapping,
                    includeNames: true,
                },
                edits:
                    settings.customerEdits[fileId]?.[
                        sheetName
                    ] ?? {},
            });
        }
    }

    const prepared = prepareImportCustomers(
        sources,
        settings.excludedCustomerKeys,
    );

    const allPrepared =
        settings.excludedCustomerKeys.length > 0
            ? prepareImportCustomers(sources).records
            : prepared.records;

    const excludedKeys = new Set(
        settings.excludedCustomerKeys,
    );

    const excludedRecords = allPrepared.filter(
        record => excludedKeys.has(record.key),
    );

    return {
        sources,
        records: prepared.records,
        mappingProblems: prepared.mappingProblems,
        excludedRecords,
    };
}