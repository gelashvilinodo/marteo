import type {
    NumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    numbersProtoUnsigned,
    readNumbersProtobuf,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

function nestedMessage(
    message: NumbersProtoMessage,
    fieldNumber: number,
): NumbersProtoMessage | null {
    const fields = message.get(fieldNumber);

    if (!fields || fields.length === 0) return null;

    if (fields.length !== 1 || fields[0].wireType !== 2) {
        throw new Error(
            "Numbers-ის უჯრედის სტილის სტრუქტურა არასწორია.",
        );
    }

    return readNumbersProtobuf(fields[0].bytes);
}

export function readNumbersStylePhoto(
    index: NumbersPhotoIndex,
    styleId: number,
): number | null {
    const visited = new Set<number>();

    function resolve(id: number): number | null {
        if (
            !Number.isSafeInteger(id) ||
            id < 1 ||
            visited.has(id) ||
            visited.size >= 64
        ) {
            throw new Error(
                "Numbers-ის უჯრედის სტილების კავშირი არასწორია.",
            );
        }

        visited.add(id);

        const packets = index.packetsById.get(id);

        if (!packets) {
            throw new Error(
                "Numbers-ის უჯრედის სტილი ვერ მოიძებნა.",
            );
        }

        const messages = packets.flatMap(packet =>
            packet.messages.filter(
                message => message.type === 6004,
            ),
        );

        if (messages.length !== 1) {
            throw new Error(
                "Numbers-ის უჯრედის სტილის ეს ვერსია დამატებით დამუშავებას მოითხოვს.",
            );
        }

        const style = readNumbersProtobuf(messages[0].bytes);
        const properties = nestedMessage(style, 11);
        const fill = properties
            ? nestedMessage(properties, 1)
            : null;

        if (fill !== null) {
            const image = nestedMessage(fill, 3);

            // ფერი ან გრადიენტი ფოტოდ არ ითვლება.
            if (image === null) return null;

            const imageData = nestedMessage(image, 6);
            const imageId = imageData
                ? numbersProtoUnsigned(imageData, 1)
                : null;

            if (imageId === null || imageId < 1) {
                throw new Error(
                    "Numbers-ის უჯრედს ფოტო აქვს, მაგრამ მისი ფაილის კოდი ვერ წავიკითხეთ.",
                );
            }

            return imageId;
        }

        // თუ შევსება აქ არ არის მითითებული,
        // შესაძლოა მშობელი სტილიდან იყოს მიღებული.
        const baseStyle = nestedMessage(style, 1);
        const parent = baseStyle
            ? nestedMessage(baseStyle, 3)
            : null;

        const parentId = parent
            ? numbersProtoUnsigned(parent, 1)
            : null;

        return parentId === null ? null : resolve(parentId);
    }

    return resolve(styleId);
}