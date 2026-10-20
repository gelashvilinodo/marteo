import "server-only";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

export type ImportPhotoUploadMetadata = {
    clientFileId: string;
    expectedRevision: number;
    sheetName: string;
    rowNumber: number;
    columnNumber: number;
    sourcePath: string;
};

const MAX_PHOTO_BYTES = 200 * 1024;
const MAX_THUMBNAIL_BYTES = 100 * 1024;

function fail(message: string): never {
    throw new OrderValidationError(message, 422);
}

function requiredText(
    value: unknown,
    label: string,
    maxLength: number,
): string {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > maxLength ||
        /[\u0000-\u001f]/.test(value)
    ) {
        fail(`${label} არასწორია ან აკლია.`);
    }

    // წყაროს ზუსტი სახელი უნდა შევინარჩუნოთ.
    return value;
}

export function validateImportPhotoMetadata(
    raw: unknown,
): ImportPhotoUploadMetadata {
    if (
        raw === null ||
        typeof raw !== "object" ||
        Array.isArray(raw)
    ) {
        fail("ფოტოს მდებარეობის მონაცემები არასწორია.");
    }

    const value = raw as Record<string, unknown>;

    const clientFileId = requiredText(
        value.clientFileId,
        "ფოტოს წყაროს ფაილის კოდი",
        36,
    );

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            clientFileId,
        )
    ) {
        fail("ფოტოს წყაროს ფაილის კოდი არასწორია.");
    }

    if (
        typeof value.expectedRevision !== "number" ||
        !Number.isSafeInteger(value.expectedRevision) ||
        value.expectedRevision < 1
    ) {
        fail("მონახაზის მოსალოდნელი ვერსია არასწორია.");
    }

    if (
        typeof value.rowNumber !== "number" ||
        !Number.isSafeInteger(value.rowNumber) ||
        value.rowNumber < 1 ||
        value.rowNumber > 1_048_576
    ) {
        fail("ფოტოს რიგის ნომერი არასწორია.");
    }

    if (
        typeof value.columnNumber !== "number" ||
        !Number.isSafeInteger(value.columnNumber) ||
        value.columnNumber < 1 ||
        value.columnNumber > 16_384
    ) {
        fail("ფოტოს სვეტის ნომერი არასწორია.");
    }

    return {
        clientFileId: clientFileId.toLowerCase(),
        expectedRevision: value.expectedRevision,
        sheetName: requiredText(
            value.sheetName,
            "ფოტოს ფურცლის სახელი",
            500,
        ),
        rowNumber: value.rowNumber,
        columnNumber: value.columnNumber,
        sourcePath: requiredText(
            value.sourcePath,
            "ფოტოს მდებარეობა წყაროში",
            4096,
        ),
    };
}

function hasSupportedSignature(bytes: Uint8Array): boolean {
    const png = [
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
    ];

    return (
        (
            bytes.length >= 8 &&
            png.every((byte, index) => bytes[index] === byte)
        ) ||
        (
            bytes.length >= 3 &&
            bytes[0] === 0xff &&
            bytes[1] === 0xd8 &&
            bytes[2] === 0xff
        ) ||
        (
            bytes.length >= 12 &&
            String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
        )
    );
}

async function validatePhoto(
    file: File,
    maxBytes: number,
): Promise<ArrayBuffer> {
    if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > maxBytes
    ) {
        fail(
            "მომზადებული ფოტოს ზომა არასწორია. აირჩიე წყაროს ფაილი ხელახლა, რომ ფოტო თავიდან შემცირდეს.",
        );
    }

    const buffer = await file.arrayBuffer();

    if (!hasSupportedSignature(new Uint8Array(buffer))) {
        fail("ფოტო უნდა იყოს JPEG, PNG ან WebP ფორმატში.");
    }

    return buffer;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return Array.from(
        new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, "0"),
    ).join("");
}

export async function validateImportPhotoUpload({
    metadata,
    file,
    thumbnail,
}: {
    metadata: unknown;
    file: File;
    thumbnail: File | null;
}) {
    const location = validateImportPhotoMetadata(metadata);
    const buffer = await validatePhoto(file, MAX_PHOTO_BYTES);

    if (thumbnail !== null) {
        await validatePhoto(thumbnail, MAX_THUMBNAIL_BYTES);
    }

    const identity = JSON.stringify([
        location.sheetName,
        location.rowNumber,
        location.columnNumber,
        location.sourcePath,
    ]);

    const sourceKey = await sha256(
        new TextEncoder().encode(identity).buffer,
    );

    return {
        metadata: location,
        sourceKey,
        sha256: await sha256(buffer),
        byteSize: file.size,
    };
}