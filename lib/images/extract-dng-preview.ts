// Extract a standard JPEG preview, never the RAW sensor tiles.
export async function extractDngPreview(file: Blob): Promise<Blob> {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const fail = () => new Error(
        "ამ DNG ფოტოში გამოსადეგი JPEG პრევიუ ვერ მოიძებნა. აირჩიე სხვა ფოტო.",
    );
    if (bytes.length < 8) throw fail();
    const little = bytes[0] === 73 && bytes[1] === 73;
    if (!little && !(bytes[0] === 77 && bytes[1] === 77)) throw fail();
    const valid = (offset: number, size: number) =>
        Number.isSafeInteger(offset) && offset >= 0 &&
        size >= 0 && offset <= bytes.length - size;
    const short = (offset: number) => view.getUint16(offset, little);
    const long = (offset: number) => view.getUint32(offset, little);
    if (short(2) !== 42) throw fail();

    type Candidate = { offset: number; size: number; area: number; orientation: number };
    const candidates: Candidate[] = [];
    const visited = new Set<number>();

    function readDirectory(offset: number, inheritedOrientation: number) {
        if (!offset || visited.has(offset) || visited.size >= 128 || !valid(offset, 2)) return;
        visited.add(offset);
        const count = short(offset);
        if (count > 4096 || !valid(offset + 2, count * 12 + 4)) return;
        const tags = new Map<number, number[]>();

        for (let i = 0; i < count; i++) {
            const entry = offset + 2 + i * 12;
            const tag = short(entry);
            if (![254, 256, 257, 259, 262, 273, 274, 279, 330, 513, 514].includes(tag)) continue;
            const type = short(entry + 2);
            const length = long(entry + 4);
            if (![3, 4, 13].includes(type) || length < 1 || length > 1024) continue;
            const unit = type === 3 ? 2 : 4;
            const start = length * unit <= 4 ? entry + 8 : long(entry + 8);
            if (!valid(start, length * unit)) continue;
            tags.set(tag, Array.from({ length }, (_, j) =>
                unit === 2 ? short(start + j * unit) : long(start + j * unit),
            ));
        }

        const orientation = tags.get(274)?.[0] ?? inheritedOrientation;
        const photometric = tags.get(262)?.[0];
        const area = (tags.get(256)?.[0] ?? 0) * (tags.get(257)?.[0] ?? 0);

        function add(start: number | undefined, size: number | undefined) {
            if (start === undefined || size === undefined || size < 4 || !valid(start, size)) return;
            if (bytes[start] !== 255 || bytes[start + 1] !== 216) return;
            candidates.push({ offset: start, size, area, orientation });
        }

        // Only rendered RGB/YCbCr previews; RAW JPEG compression is not a preview.
        if (photometric === 2 || photometric === 6) {
            add(tags.get(513)?.[0], tags.get(514)?.[0]);
            if (tags.get(259)?.[0] === 7 && tags.get(273)?.length === 1 && tags.get(279)?.length === 1) {
                add(tags.get(273)?.[0], tags.get(279)?.[0]);
            }
        }
        for (const child of tags.get(330) ?? []) readDirectory(child, orientation);
        readDirectory(long(offset + 2 + count * 12), orientation);
    }

    readDirectory(long(4), 1);
    candidates.sort((a, b) => b.area - a.area || b.size - a.size);
    const candidate = candidates[0];
    if (!candidate) throw fail();

    const jpeg = bytes.slice(candidate.offset, candidate.offset + candidate.size);
    // Normalize the orientation metadata: the browser then applies it once.
    const chunks: Uint8Array<ArrayBuffer>[] = [jpeg.slice(0, 2)];
    const exif = new Uint8Array([
        255, 225, 0, 34, 69, 120, 105, 102, 0, 0,
        77, 77, 0, 42, 0, 0, 0, 8,
        0, 1, 1, 18, 0, 3, 0, 0, 0, 1,
        0, candidate.orientation >= 1 && candidate.orientation <= 8 ? candidate.orientation : 1,
        0, 0, 0, 0, 0, 0,
    ]);
    chunks.push(exif);
    let position = 2;
    while (position + 4 <= jpeg.length && jpeg[position] === 255) {
        const marker = jpeg[position + 1];
        if (marker === 218 || marker === 217) break;
        if (marker === 0 || marker === 255 || marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) break;
        const size = jpeg[position + 2] * 256 + jpeg[position + 3];
        const end = position + 2 + size;
        if (size < 2 || end > jpeg.length) throw fail();
        const oldExif = marker === 225 &&
            jpeg[position + 4] === 69 && jpeg[position + 5] === 120 &&
            jpeg[position + 6] === 105 && jpeg[position + 7] === 102 &&
            jpeg[position + 8] === 0 && jpeg[position + 9] === 0;
        if (!oldExif) chunks.push(jpeg.slice(position, end));
        position = end;
    }
    chunks.push(jpeg.slice(position));
    return new Blob(chunks, { type: "image/jpeg" });
}
