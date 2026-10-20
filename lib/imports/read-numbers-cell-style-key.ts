export function readNumbersCellStyleKey(
    bytes: Uint8Array,
): number | null {
    if (bytes.length < 12) {
        throw new Error(
            "Numbers-ის უჯრედის შიდა მონაცემები არასრულია.",
        );
    }

    // ამ ეტაპზე მხარდაჭერილია უჯრედის მეხუთე ვერსია.
    // სხვა ვერსიის სტილის მდებარეობას არ ვვარაუდობთ.
    if (bytes[0] !== 5) {
        throw new Error(
            "Numbers-ის უჯრედის ამ ვერსიიდან ფოტოს კავშირის წაკითხვა ჯერ არ არის მხარდაჭერილი.",
        );
    }

    const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
    );

    const flags = view.getUint32(8, true);

    if ((flags & 0x20) === 0) return null;

    let offset = 12;

    // სტილის კოდამდე არსებული მნიშვნელობების ზომები.
    const precedingFields = [
        { flag: 0x01, size: 16 },
        { flag: 0x02, size: 8 },
        { flag: 0x04, size: 8 },
        { flag: 0x08, size: 4 },
        { flag: 0x10, size: 4 },
    ] as const;

    for (const field of precedingFields) {
        if ((flags & field.flag) !== 0) {
            offset += field.size;
        }
    }

    if (offset + 4 > bytes.length) {
        throw new Error(
            "Numbers-ის უჯრედის სტილის კოდი არასრულადაა შენახული.",
        );
    }

    const key = view.getInt32(offset, true);

    if (key < 0) {
        throw new Error(
            "Numbers-ის უჯრედის სტილის კოდი არასწორია.",
        );
    }

    return key;
}