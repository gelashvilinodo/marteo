import type {
    NumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    numbersProtoText,
    numbersProtoUnsigned,
    readNumbersProtobuf,
    type NumbersProtoField,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

export type NumbersPhotoTable = {
    sheetName: string;
    tableId: number;
};

function referenceId(field: NumbersProtoField): number {
    if (field.wireType !== 2) {
        throw new Error(
            "Numbers-ის ფურცლის შიდა კავშირი არასწორია.",
        );
    }

    const reference = readNumbersProtobuf(field.bytes);
    const id = numbersProtoUnsigned(reference, 1);

    if (id === null || id < 1) {
        throw new Error(
            "Numbers-ის ფურცლის შიდა კავშირის კოდი არასწორია.",
        );
    }

    return id;
}

function objectMessage(
    index: NumbersPhotoIndex,
    id: number,
    type: number,
    optional = false,
): NumbersProtoMessage | null {
    const packets = index.packetsById.get(id) ?? [];

    const messages = packets.flatMap(packet =>
        packet.messages.filter(message => message.type === type),
    );

    if (optional && messages.length === 0) return null;

    if (messages.length !== 1) {
        throw new Error(
            "Numbers-ის ფურცლის შიდა ჩანაწერი ერთმნიშვნელოვნად ვერ წავიკითხეთ.",
        );
    }

    return readNumbersProtobuf(messages[0].bytes);
}

export function readNumbersPhotoTables(
    index: NumbersPhotoIndex,
    parsedSheetNames: readonly string[],
): NumbersPhotoTable[] {
    const document = objectMessage(index, 1, 1);

    if (document === null) {
        throw new Error(
            "Numbers-ის დოკუმენტის ძირითადი ჩანაწერი ვერ მოიძებნა.",
        );
    }

    const result: NumbersPhotoTable[] = [];

    for (const field of document.get(1) ?? []) {
        const sheetId = referenceId(field);
        const sheet = objectMessage(index, sheetId, 2);

        if (sheet === null) {
            throw new Error(
                "Numbers-ის ფურცლის აღწერა ვერ მოიძებნა.",
            );
        }

        const sourceName = numbersProtoText(sheet, 1);

        if (!sourceName) {
            throw new Error(
                "Numbers-ის ფურცლის სახელი ვერ წავიკითხეთ.",
            );
        }

        let tableIndex = 0;

        for (const shapeField of sheet.get(2) ?? []) {
            const shapeId = referenceId(shapeField);

            // ფურცელზე დიაგრამები და სხვა ობიექტებიც შეიძლება იყოს.
            const tableInfo = objectMessage(
                index,
                shapeId,
                6000,
                true,
            );

            if (tableInfo === null) continue;

            const references = tableInfo.get(2);

            if (!references || references.length !== 1) {
                throw new Error(
                    "Numbers-ის ცხრილის ძირითადი კავშირი არასრულია.",
                );
            }

            result.push({
                sheetName: tableIndex === 0
                    ? sourceName
                    : `${sourceName}_${tableIndex}`,
                tableId: referenceId(references[0]),
            });

            tableIndex++;
        }
    }

    // ფოტოს სხვა ცხრილთან შემთხვევით მიბმას არ ვუშვებთ.
    // სახელები და მიმდევრობა ძირითად წამკითხველს უნდა ემთხვეოდეს.
    if (
        result.length !== parsedSheetNames.length ||
        result.some(
            (table, index) =>
                table.sheetName !== parsedSheetNames[index],
        )
    ) {
        throw new Error(
            "Numbers-ის ფოტოების ფურცლები წაკითხულ ცხრილებს ზუსტად ვერ დავუკავშირეთ. ფოტოების მდებარეობა გადასამოწმებელია.",
        );
    }

    return result;
}