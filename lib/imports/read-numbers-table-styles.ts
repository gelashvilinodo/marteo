import type {
    NumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    numbersProtoUnsigned,
    readNumbersProtobuf,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

function readReference(
    message: NumbersProtoMessage,
    fieldNumber: number,
): number | null {
    const fields = message.get(fieldNumber);

    if (!fields || fields.length === 0) return null;

    if (fields.length !== 1 || fields[0].wireType !== 2) {
        throw new Error(
            "Numbers-ის სტილების კავშირის სტრუქტურა არასწორია.",
        );
    }

    const reference = readNumbersProtobuf(fields[0].bytes);
    const id = numbersProtoUnsigned(reference, 1);

    if (id === null || id < 1) {
        throw new Error(
            "Numbers-ის სტილების კავშირის კოდი არასწორია.",
        );
    }

    return id;
}

export function readNumbersTableStyles(
    index: NumbersPhotoIndex,
    dataStore: NumbersProtoMessage,
): Map<number, number> {
    const result = new Map<number, number>();
    const listId = readReference(dataStore, 5);

    if (listId === null) return result;

    const packets = index.packetsById.get(listId) ?? [];

    const messages = packets.flatMap(packet =>
        packet.messages.filter(message => message.type === 6005),
    );

    if (messages.length !== 1) {
        throw new Error(
            "Numbers-ის ცხრილის სტილების სია ერთმნიშვნელოვნად ვერ წავიკითხეთ.",
        );
    }

    const list = readNumbersProtobuf(messages[0].bytes);

    if (numbersProtoUnsigned(list, 1) !== 4) {
        throw new Error(
            "Numbers-ის ცხრილის სტილების სიის ტიპი არასწორია.",
        );
    }

    if ((list.get(4)?.length ?? 0) > 0) {
        throw new Error(
            "Numbers-ის ნაწილებად დაყოფილი სტილების სიის წაკითხვა ჯერ არ არის მხარდაჭერილი.",
        );
    }

    for (const field of list.get(3) ?? []) {
        if (field.wireType !== 2) {
            throw new Error(
                "Numbers-ის ცხრილის სტილის ჩანაწერი არასწორია.",
            );
        }

        const entry = readNumbersProtobuf(field.bytes);
        const key = numbersProtoUnsigned(entry, 1);
        const styleId = readReference(entry, 4);

        if (
            key === null ||
            styleId === null ||
            result.has(key)
        ) {
            throw new Error(
                "Numbers-ის ცხრილის სტილის კოდი აკლია ან მეორდება.",
            );
        }

        result.set(key, styleId);
    }

    return result;
}