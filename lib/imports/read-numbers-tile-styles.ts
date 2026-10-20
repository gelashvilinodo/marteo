import {
    readNumbersCellStyleKey,
} from "./read-numbers-cell-style-key";

import {
    numbersProtoUnsigned,
    readNumbersProtobuf,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

export type NumbersTileCellStyle = {
    // ბლოკის შიგნით მდებარეობა, ნულიდან.
    rowIndex: number;
    columnIndex: number;
    styleKey: number;
};

function binaryField(
    message: NumbersProtoMessage,
    fieldNumber: number,
): Uint8Array {
    const fields = message.get(fieldNumber);

    if (
        !fields ||
        fields.length !== 1 ||
        fields[0].wireType !== 2
    ) {
        throw new Error(
            "Numbers-ის ცხრილის ბლოკს უჯრედების მონაცემები აკლია.",
        );
    }

    return fields[0].bytes;
}

export function readNumbersTileStyles(
    bytes: Uint8Array,
): NumbersTileCellStyle[] {
    const tile = readNumbersProtobuf(bytes);
    const storageVersion = numbersProtoUnsigned(tile, 7);

    if (storageVersion !== null && storageVersion !== 1) {
        throw new Error(
            "Numbers-ის ცხრილის ბლოკის ამ ვერსიიდან ფოტოების წაკითხვა ჯერ არ არის მხარდაჭერილი.",
        );
    }

    const result: NumbersTileCellStyle[] = [];
    const seenCells = new Set<string>();

    for (const field of tile.get(5) ?? []) {
        if (field.wireType !== 2) {
            throw new Error(
                "Numbers-ის ცხრილის რიგის სტრუქტურა არასწორია.",
            );
        }

        const row = readNumbersProtobuf(field.bytes);
        const rowIndex = numbersProtoUnsigned(row, 1);
        const cellCount = numbersProtoUnsigned(row, 2);
        const wideOffsets = numbersProtoUnsigned(row, 8);

        if (
            rowIndex === null ||
            rowIndex >= 1_048_576 ||
            cellCount === null ||
            cellCount > 16_384 ||
            (
                wideOffsets !== null &&
                wideOffsets !== 0 &&
                wideOffsets !== 1
            )
        ) {
            throw new Error(
                "Numbers-ის ცხრილის რიგის მდებარეობა ან ზომა არასწორია.",
            );
        }

        const storage = binaryField(row, 6);
        const offsetBytes = binaryField(row, 7);

        if (
            offsetBytes.length % 2 !== 0 ||
            offsetBytes.length / 2 > 16_384
        ) {
            throw new Error(
                "Numbers-ის უჯრედების მდებარეობების სია არასწორია.",
            );
        }

        const offsetsView = new DataView(
            offsetBytes.buffer,
            offsetBytes.byteOffset,
            offsetBytes.byteLength,
        );

        const offsets: {
            columnIndex: number;
            start: number;
        }[] = [];

        const width = wideOffsets === 1 ? 4 : 1;

        for (
            let columnIndex = 0;
            columnIndex < offsetBytes.length / 2;
            columnIndex++
        ) {
            const offset = offsetsView.getUint16(
                columnIndex * 2,
                true,
            );

            if (offset === 65_535) continue;

            const start = offset * width;

            if (
                start >= storage.length ||
                (
                    offsets.length > 0 &&
                    start <= offsets[offsets.length - 1].start
                )
            ) {
                throw new Error(
                    "Numbers-ის უჯრედის მდებარეობა დაზიანებულია.",
                );
            }

            offsets.push({ columnIndex, start });
        }

        if (offsets.length !== cellCount) {
            throw new Error(
                "Numbers-ის რიგში უჯრედების რაოდენობა არ ემთხვევა აღწერას.",
            );
        }

        for (let index = 0; index < offsets.length; index++) {
            const current = offsets[index];
            const end =
                offsets[index + 1]?.start ?? storage.length;

            const key = `${rowIndex}:${current.columnIndex}`;

            if (seenCells.has(key)) {
                throw new Error(
                    "Numbers-ის ცხრილის ბლოკში უჯრედის მდებარეობა მეორდება.",
                );
            }

            seenCells.add(key);

            const styleKey = readNumbersCellStyleKey(
                storage.subarray(current.start, end),
            );

            if (styleKey !== null) {
                result.push({
                    rowIndex,
                    columnIndex: current.columnIndex,
                    styleKey,
                });
            }
        }
    }

    return result;
}