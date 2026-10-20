import {
    numbersProtoUnsigned,
    readNumbersProtobuf,
    readNumbersUnsigned,
    type NumbersProtoMessage,
} from "./read-numbers-protobuf";

export type NumbersIwaMessage = {
    type: number;
    metadata: NumbersProtoMessage;
    bytes: Uint8Array;
};

export type NumbersIwaPacket = {
    id: number;
    merge: boolean;
    messages: NumbersIwaMessage[];
};

function readHeaderLength(
    bytes: Uint8Array,
    start: number,
): {
    length: number;
    nextPosition: number;
} {
    let position = start;

    for (let index = 0; index < 10; index++) {
        if (position >= bytes.length) {
            throw new Error(
                "Numbers-ის შიდა ჩანაწერის სათაური არასრულია.",
            );
        }

        const byte = bytes[position++];

        if (byte < 128) {
            return {
                length: readNumbersUnsigned(
                    bytes.subarray(start, position),
                ),
                nextPosition: position,
            };
        }
    }

    throw new Error(
        "Numbers-ის შიდა ჩანაწერის სათაური არასწორია.",
    );
}

export function readNumbersIwaPackets(
    bytes: Uint8Array,
): NumbersIwaPacket[] {
    const packets: NumbersIwaPacket[] = [];
    let position = 0;
    let messageCount = 0;

    while (position < bytes.length) {
        if (packets.length >= 100_000) {
            throw new Error(
                "Numbers-ის შიდა ფაილში ზედმეტად ბევრი ჩანაწერია.",
            );
        }

        const header = readHeaderLength(bytes, position);
        position = header.nextPosition;

        if (
            header.length === 0 ||
            header.length > bytes.length - position
        ) {
            throw new Error(
                "Numbers-ის შიდა ჩანაწერის სათაურის ზომა არასწორია.",
            );
        }

        const info = readNumbersProtobuf(
            bytes.subarray(position, position + header.length),
        );

        position += header.length;

        const id = numbersProtoUnsigned(info, 1);
        const mergeValue = numbersProtoUnsigned(info, 3);

        if (
            id === null ||
            id < 1 ||
            (
                mergeValue !== null &&
                mergeValue !== 0 &&
                mergeValue !== 1
            )
        ) {
            throw new Error(
                "Numbers-ის შიდა ჩანაწერის კოდი ან გაერთიანების წესი არასწორია.",
            );
        }

        const messages: NumbersIwaMessage[] = [];
        const messageHeaders = info.get(2) ?? [];

        if (messageHeaders.length === 0) {
            throw new Error(
                "Numbers-ის შიდა ჩანაწერს შიგთავსის აღწერა აკლია.",
            );
        }

        for (const field of messageHeaders) {
            messageCount++;

            if (
                field.wireType !== 2 ||
                messageCount > 100_000
            ) {
                throw new Error(
                    "Numbers-ის შიდა შეტყობინებების სტრუქტურა არასწორია.",
                );
            }

            const metadata = readNumbersProtobuf(field.bytes);
            const type = numbersProtoUnsigned(metadata, 1);
            const length = numbersProtoUnsigned(metadata, 3);

            if (
                type === null ||
                type < 0 ||
                length === null ||
                length > bytes.length - position
            ) {
                throw new Error(
                    "Numbers-ის შიდა შეტყობინების ტიპი ან ზომა არასწორია.",
                );
            }

            messages.push({
                type,
                metadata,
                bytes: bytes.subarray(
                    position,
                    position + length,
                ),
            });

            position += length;
        }

        packets.push({
            id,
            merge: mergeValue === 1,
            messages,
        });
    }

    return packets;
}