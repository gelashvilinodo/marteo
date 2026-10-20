import type {
    NumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    numbersProtoUnsigned,
    readNumbersProtobuf,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

import {
    readNumbersTableStyles,
} from "./read-numbers-table-styles";

import {
    readNumbersTileStyles,
} from "./read-numbers-tile-styles";

import {
    readNumbersStylePhoto,
} from "./read-numbers-style-photo";

export type NumbersTablePhoto = {
    rowNumber: number;
    columnNumber: number;
    imageId: number;
};

function nested(
    message: NumbersProtoMessage,
    fieldNumber: number,
): NumbersProtoMessage {
    const fields = message.get(fieldNumber);

    if (
        !fields ||
        fields.length !== 1 ||
        fields[0].wireType !== 2
    ) {
        throw new Error(
            "Numbers-ის ცხრილის ფოტოების კავშირი არასრულია.",
        );
    }

    return readNumbersProtobuf(fields[0].bytes);
}

function reference(
    message: NumbersProtoMessage,
    fieldNumber: number,
): number {
    const id = numbersProtoUnsigned(
        nested(message, fieldNumber),
        1,
    );

    if (id === null || id < 1) {
        throw new Error(
            "Numbers-ის ცხრილის შიდა კავშირის კოდი არასწორია.",
        );
    }

    return id;
}

function objectMessage(
    index: NumbersPhotoIndex,
    id: number,
    type: number,
): NumbersProtoMessage {
    const packets = index.packetsById.get(id) ?? [];

    const messages = packets.flatMap(packet =>
        packet.messages.filter(message => message.type === type),
    );

    if (messages.length !== 1) {
        throw new Error(
            "Numbers-ის ცხრილის შიდა ჩანაწერი ერთმნიშვნელოვნად ვერ წავიკითხეთ.",
        );
    }

    return readNumbersProtobuf(messages[0].bytes);
}

export function readNumbersTablePhotos(
    index: NumbersPhotoIndex,
    tableId: number,
): NumbersTablePhoto[] {
    const table = objectMessage(index, tableId, 6001);
    const rowCount = numbersProtoUnsigned(table, 6);
    const columnCount = numbersProtoUnsigned(table, 7);

    if (
        rowCount === null ||
        rowCount < 1 ||
        rowCount > 1_048_576 ||
        columnCount === null ||
        columnCount < 1 ||
        columnCount > 16_384
    ) {
        throw new Error(
            "Numbers-ის ცხრილის ზომები არასწორია.",
        );
    }

    const store = nested(table, 4);
    const styles = readNumbersTableStyles(index, store);
    const tileStorage = nested(store, 3);
    const tileEntries = tileStorage.get(1) ?? [];
    const rowTree = nested(store, 9);

    const result: NumbersTablePhoto[] = [];
    const seenCells = new Set<string>();
    const photoByStyle = new Map<number, number | null>();

    for (const field of rowTree.get(1) ?? []) {
        if (field.wireType !== 2) {
            throw new Error(
                "Numbers-ის ცხრილის რიგების კავშირი არასწორია.",
            );
        }

        const node = readNumbersProtobuf(field.bytes);
        const firstRow = numbersProtoUnsigned(node, 1);
        const tileIndex = numbersProtoUnsigned(node, 2);

        if (
            firstRow === null ||
            firstRow >= rowCount ||
            tileIndex === null
        ) {
            throw new Error(
                "Numbers-ის ცხრილის ბლოკის მდებარეობა არასწორია.",
            );
        }

        const tileEntry = tileEntries[tileIndex];

        if (!tileEntry || tileEntry.wireType !== 2) {
            throw new Error(
                "Numbers-ის ცხრილის შესაბამისი ბლოკი ვერ მოიძებნა.",
            );
        }

        const tileLink = readNumbersProtobuf(tileEntry.bytes);
        const tileId = reference(tileLink, 2);

        const tile = objectMessage(index, tileId, 6002);
        const tileRows = numbersProtoUnsigned(tile, 4);

        if (
            tileRows === null ||
            tileRows < 1 ||
            firstRow + tileRows > rowCount
        ) {
            throw new Error(
                "Numbers-ის ცხრილის ბლოკის რიგების რაოდენობა არასწორია.",
            );
        }

        const packets = index.packetsById.get(tileId) ?? [];
        const tileMessages = packets.flatMap(packet =>
            packet.messages.filter(message => message.type === 6002),
        );

        const cells = readNumbersTileStyles(
            tileMessages[0].bytes,
        );

        for (const cell of cells) {
            if (
                cell.rowIndex >= tileRows ||
                cell.columnIndex >= columnCount
            ) {
                throw new Error(
                    "Numbers-ის უჯრედი ცხრილის საზღვრებს სცდება.",
                );
            }

            const rowNumber = firstRow + cell.rowIndex + 1;
            const columnNumber = cell.columnIndex + 1;
            const cellKey = `${rowNumber}:${columnNumber}`;

            if (seenCells.has(cellKey)) {
                throw new Error(
                    "Numbers-ის ცხრილში უჯრედის მდებარეობა მეორდება.",
                );
            }

            seenCells.add(cellKey);

            const styleId = styles.get(cell.styleKey);

            if (styleId === undefined) {
                throw new Error(
                    "Numbers-ის უჯრედის შესაბამისი სტილი ვერ მოიძებნა.",
                );
            }

            if (!photoByStyle.has(styleId)) {
                photoByStyle.set(
                    styleId,
                    readNumbersStylePhoto(index, styleId),
                );
            }

            const imageId = photoByStyle.get(styleId);

            if (imageId !== null && imageId !== undefined) {
                result.push({
                    rowNumber,
                    columnNumber,
                    imageId,
                });
            }
        }
    }

    return result;
}