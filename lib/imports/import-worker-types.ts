import type { ParsedImportFile } from "./import-file-types";
import type { ImportPhotoReadResult } from "./import-photo-types";

export type ImportCsvOptions = {
    delimiter?: "," | ";" | "\t" | "|";
    encoding?: string;
};

export type ImportReadStage =
    | "READING"
    | "PARSING";

export type ImportWorkerRequest = {
    file: File;
    csvOptions?: ImportCsvOptions;
};

export type ImportWorkerResponse =
    | {
        type: "PROGRESS";
        stage: ImportReadStage;
    }
    | {
        type: "SUCCESS";
        result: ParsedImportFile;
        photoResult: ImportPhotoReadResult;
    }
    | {
        type: "ERROR";
        message: string;
    };