import {
    ImportDraftFileError,
    validateImportDraftFile,
} from "./validate-import-draft-file";
import type {
    OrderDraftFile,
} from "./prepare-draft-order-rows";

type StoredOrderDraftFile = {
    sha256: string;
    originalName: string;
    format: string;
    byteSize: number;
    structure: unknown;
};

export function readOrderDraftFiles(
    storedFiles: readonly StoredOrderDraftFile[],
): OrderDraftFile[] {
    const identities = new Set<string>();

    return storedFiles.map(stored => {
        const raw = stored.structure;

        if (
            typeof raw !== "object" ||
            raw === null ||
            Array.isArray(raw)
        ) {
            throw new ImportDraftFileError(
                "შეკვეთების წყაროს შენახული სტრუქტურა ვერ დადასტურდა. ხელახლა გახსენი მონახაზი.",
            );
        }

        const structure = raw as Record<string, unknown>;
        const clientFileId = structure.clientFileId;

        if (
            typeof clientFileId !== "string" ||
            !clientFileId.trim() ||
            clientFileId !== clientFileId.trim() ||
            identities.has(clientFileId)
        ) {
            throw new ImportDraftFileError(
                "შეკვეთების წყაროს ფაილის კოდი არასწორია ან მეორდება. იმპორტი არ შესრულებულა.",
            );
        }

        identities.add(clientFileId);

        const file = validateImportDraftFile(
            structure.parsedFile,
        );

        if (
            file.sha256 !== stored.sha256 ||
            file.originalName !== stored.originalName ||
            file.format !== stored.format ||
            file.byteSize !== stored.byteSize
        ) {
            throw new ImportDraftFileError(
                "შეკვეთების შენახული ფაილის მონაცემები ერთმანეთს არ ემთხვევა. იმპორტი შეჩერებულია წყაროს ხელახლა შესამოწმებლად.",
            );
        }

        return {
            clientFileId,
            file,
        };
    });
}