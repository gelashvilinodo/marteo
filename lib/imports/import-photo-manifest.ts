import type {
    ParsedImportFile,
} from "./import-file-types";

import type {
    ImportPhotoReadIssue,
    ImportPhotoReadResult,
} from "./import-photo-types";

export type ImportPhotoSource = {
    sheetName: string;
    rowNumber: number;
    columnNumber: number;
    sourcePath: string;
};

export type ImportPhotoManifest = {
    version: 1;
    sources: ImportPhotoSource[];
    issues: ImportPhotoReadIssue[];
};

export function createImportPhotoManifest(
    result: ImportPhotoReadResult,
): ImportPhotoManifest {
    return {
        version: 1,
        sources: result.photos.map(photo => ({
            sheetName: photo.sheetName,
            rowNumber: photo.rowNumber,
            columnNumber: photo.columnNumber,
            sourcePath: photo.sourcePath,
        })),
        issues: result.issues.map(issue => ({ ...issue })),
    };
}

function object(
    value: unknown,
): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error(
            "წყაროს ფოტოების აღწერის ფორმატი არასწორია.",
        );
    }

    return value as Record<string, unknown>;
}

function text(
    value: unknown,
    maxLength: number,
): string {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > maxLength ||
        /[\u0000-\u001f]/.test(value)
    ) {
        throw new Error(
            "წყაროს ფოტოების აღწერა არასრულია.",
        );
    }

    return value;
}

function positiveInteger(
    value: unknown,
    maximum: number,
): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > maximum
    ) {
        throw new Error(
            "წყაროს ფოტოს მდებარეობა არასწორია.",
        );
    }

    return value;
}

export function readImportPhotoManifest(
    raw: unknown,
    file: ParsedImportFile,
): ImportPhotoManifest | null {
    // ძველ მონახაზში სიის არქონა არ ნიშნავს,
    // რომ წყაროს ფაილში ფოტოები არ იყო.
    if (raw === null || raw === undefined) return null;

    const value = object(raw);

    if (
        value.version !== 1 ||
        !Array.isArray(value.sources) ||
        !Array.isArray(value.issues) ||
        value.sources.length > 10_000 ||
        value.issues.length > 10_000
    ) {
        throw new Error(
            "წყაროს ფოტოების სია არასწორია ან ძალიან დიდია.",
        );
    }

    const sheetNames = new Set(
        file.sheets.map(sheet => sheet.name),
    );

    const identities = new Set<string>();

    const sources: ImportPhotoSource[] = value.sources.map(rawSource => {
        const source = object(rawSource);
        const sheetName = text(source.sheetName, 500);

        if (!sheetNames.has(sheetName)) {
            throw new Error(
                "ფოტოს ფურცელი წყაროს ფაილში ვერ მოიძებნა.",
            );
        }

        const result: ImportPhotoSource = {
            sheetName,
            rowNumber: positiveInteger(
                source.rowNumber,
                1_048_576,
            ),
            columnNumber: positiveInteger(
                source.columnNumber,
                16_384,
            ),
            sourcePath: text(source.sourcePath, 4096),
        };

        const identity = JSON.stringify([
            result.sheetName,
            result.rowNumber,
            result.columnNumber,
            result.sourcePath,
        ]);

        if (identities.has(identity)) {
            throw new Error(
                "წყაროს ფოტოების სიაში მდებარეობა მეორდება.",
            );
        }

        identities.add(identity);
        return result;
    });

    const issues: ImportPhotoReadIssue[] = value.issues.map(rawIssue => {
        const issue = object(rawIssue);

        if (
            issue.code !== "UNSUPPORTED_IMAGE" &&
            issue.code !== "UNRESOLVED_IMAGE_POSITION" &&
            issue.code !== "MULTIPLE_IMAGES" &&
            issue.code !== "BROKEN_IMAGE"
        ) {
            throw new Error(
                "წყაროს ფოტოს პრობლემის კოდი არასწორია.",
            );
        }

        const sheetName = issue.sheetName === null
            ? null
            : text(issue.sheetName, 500);

        if (
            sheetName !== null &&
            !sheetNames.has(sheetName)
        ) {
            throw new Error(
                "ფოტოს პრობლემის ფურცელი წყაროს არ ემთხვევა.",
            );
        }

        const rowNumber = issue.rowNumber === null
            ? null
            : positiveInteger(issue.rowNumber, 1_048_576);

        if (sheetName === null && rowNumber !== null) {
            throw new Error(
                "ფოტოს პრობლემას რიგი აქვს, მაგრამ ფურცელი არ აქვს მითითებული.",
            );
        }

        return {
            code: issue.code,
            message: text(issue.message, 4000),
            sheetName,
            rowNumber,
        };
    });

    return {
        version: 1,
        sources,
        issues,
    };
}