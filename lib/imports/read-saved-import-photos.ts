import type {
    ParsedImportFile,
} from "./import-file-types";

export type SavedImportPhoto = {
    id: string;
    sourceKey: string;
    sheetName: string;
    rowNumber: number;
    columnNumber: number;
    sourcePath: string;
    originalName: string;
    sha256: string;
    byteSize: number;
    storagePath: string;
    imageUrl: string;
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
            "შენახული ფოტოს აღწერა არასწორია.",
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
            "შენახული ფოტოს აღწერა არასრულია.",
        );
    }

    return value;
}

export function readSavedImportPhotos(
    raw: unknown,
    businessId: string,
    file: ParsedImportFile,
): SavedImportPhoto[] {
    if (!Array.isArray(raw) || raw.length > 10_000) {
        throw new Error(
            "შენახული ფოტოების სია არასწორია ან ძალიან დიდია.",
        );
    }

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId)) {
        throw new Error(
            "შენახული ფოტოების ბიზნესის კოდი არასწორია.",
        );
    }

    const rowsBySheet = new Map(
        file.sheets.map(sheet => [
            sheet.name,
            new Set(sheet.rows.map(row => row.rowNumber)),
        ]),
    );

    const sourceKeys = new Set<string>();
    const photoIds = new Set<string>();

    return raw.map(value => {
        const item = object(value);

        const id = text(item.id, 200);
        const sourceKey = text(item.sourceKey, 64);
        const sha256 = text(item.sha256, 64);
        const sheetName = text(item.sheetName, 500);
        const storagePath = text(item.storagePath, 512);
        const imageUrl = text(item.imageUrl, 2048);

        if (
            !/^[0-9a-f]{64}$/.test(sourceKey) ||
            !/^[0-9a-f]{64}$/.test(sha256) ||
            sourceKeys.has(sourceKey) ||
            photoIds.has(id)
        ) {
            throw new Error(
                "შენახული ფოტოს კოდი არასწორია ან მეორდება.",
            );
        }

        if (
            typeof item.rowNumber !== "number" ||
            !Number.isSafeInteger(item.rowNumber) ||
            !rowsBySheet.get(sheetName)?.has(item.rowNumber) ||
            typeof item.columnNumber !== "number" ||
            !Number.isSafeInteger(item.columnNumber) ||
            item.columnNumber < 1 ||
            item.columnNumber > 16_384
        ) {
            throw new Error(
                "შენახული ფოტოს ფურცელი ან მდებარეობა წყაროს ფაილს არ ემთხვევა.",
            );
        }

        if (
            typeof item.byteSize !== "number" ||
            !Number.isSafeInteger(item.byteSize) ||
            item.byteSize < 1 ||
            item.byteSize > 200 * 1024
        ) {
            throw new Error(
                "შენახული ფოტოს ზომა არასწორია.",
            );
        }

        const pathParts = storagePath.split("/");

        if (
            pathParts.length !== 2 ||
            pathParts[0] !== businessId ||
            !/^[0-9a-f-]{36}(\.full)?\.(png|jpg|webp)$/.test(
                pathParts[1],
            ) ||
            imageUrl !==
                "https://uwxmbyweyvnekzzecroz.supabase.co" +
                "/storage/v1/object/public/product-images/" +
                storagePath
        ) {
            throw new Error(
                "შენახული ფოტოს საცავის მისამართი ამ ბიზნესს არ ეკუთვნის ან არასწორია.",
            );
        }

        sourceKeys.add(sourceKey);
        photoIds.add(id);

        return {
            id,
            sourceKey,
            sheetName,
            rowNumber: item.rowNumber,
            columnNumber: item.columnNumber,
            sourcePath: text(item.sourcePath, 4096),
            originalName: text(item.originalName, 512),
            sha256,
            byteSize: item.byteSize,
            storagePath,
            imageUrl,
        };
    });
}