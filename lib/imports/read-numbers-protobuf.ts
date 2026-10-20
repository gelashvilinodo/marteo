export type NumbersProtoField = {
    wireType: 0 | 1 | 2 | 5;
    bytes: Uint8Array;
};

export type NumbersProtoMessage =
    Map<number, NumbersProtoField[]>;

type Cursor = {
    position: number;
};

function readVarint(
    bytes: Uint8Array,
    cursor: Cursor,
): bigint {
    let value = 0n;

    for (let index = 0; index < 10; index++) {
        if (cursor.position >= bytes.length) {
            throw new Error(
                "Numbers-ის შიდა რიცხვითი მონაცემი არასრულია.",
            );
        }

        const byte = bytes[cursor.position++];

        if (index === 9 && byte > 1) {
            throw new Error(
                "Numbers-ის შიდა რიცხვითი მონაცემი არასწორია.",
            );
        }

        value |= BigInt(byte & 127) << BigInt(index * 7);

        if (byte < 128) return value;
    }

    throw new Error(
        "Numbers-ის შიდა რიცხვითი მონაცემი ძალიან გრძელია.",
    );
}

function safeNumber(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(
            "Numbers-ის შიდა რიცხვი დასაშვებ დიაპაზონს სცდება.",
        );
    }

    return Number(value);
}

export function readNumbersUnsigned(
    bytes: Uint8Array,
): number {
    const cursor: Cursor = { position: 0 };
    const value = safeNumber(readVarint(bytes, cursor));

    if (cursor.position !== bytes.length) {
        throw new Error(
            "Numbers-ის შიდა რიცხვს ზედმეტი მონაცემები ახლავს.",
        );
    }

    return value;
}

export function readNumbersProtobuf(
    bytes: Uint8Array,
): NumbersProtoMessage {
    const message: NumbersProtoMessage = new Map();
    const cursor: Cursor = { position: 0 };
    let fieldCount = 0;

    while (cursor.position < bytes.length) {
        fieldCount++;

        if (fieldCount > 1_000_000) {
            throw new Error(
                "Numbers-ის შიდა ჩანაწერი ზედმეტად ბევრ ველს შეიცავს.",
            );
        }

        const tag = safeNumber(readVarint(bytes, cursor));
        const fieldNumber = Math.floor(tag / 8);
        const wireType = tag % 8;

        if (
            fieldNumber < 1 ||
            fieldNumber > 536_870_911 ||
            (
                wireType !== 0 &&
                wireType !== 1 &&
                wireType !== 2 &&
                wireType !== 5
            )
        ) {
            throw new Error(
                "Numbers-ის შიდა ველის ფორმატი არასწორია.",
            );
        }

        let start = cursor.position;
        let end: number;

        if (wireType === 0) {
            readVarint(bytes, cursor);
            end = cursor.position;
        } else if (wireType === 2) {
            const length = safeNumber(
                readVarint(bytes, cursor),
            );

            start = cursor.position;

            if (length > bytes.length - start) {
                throw new Error(
                    "Numbers-ის შიდა ველის მონაცემები არასრულია.",
                );
            }

            end = start + length;
            cursor.position = end;
        } else {
            const length = wireType === 1 ? 8 : 4;

            if (length > bytes.length - start) {
                throw new Error(
                    "Numbers-ის შიდა ველის მონაცემები არასრულია.",
                );
            }

            end = start + length;
            cursor.position = end;
        }

        const field: NumbersProtoField = {
            wireType,
            bytes: bytes.subarray(start, end),
        };

        const existing = message.get(fieldNumber);

        if (existing) {
            existing.push(field);
        } else {
            message.set(fieldNumber, [field]);
        }
    }

    return message;
}

export function numbersProtoUnsigned(
    message: NumbersProtoMessage,
    fieldNumber: number,
): number | null {
    const field = message.get(fieldNumber)?.[0];

    if (!field || field.wireType !== 0) return null;

    return readNumbersUnsigned(field.bytes);
}

export function numbersProtoText(
    message: NumbersProtoMessage,
    fieldNumber: number,
): string | null {
    const field = message.get(fieldNumber)?.[0];

    if (!field || field.wireType !== 2) return null;

    return new TextDecoder("utf-8", {
        fatal: true,
    }).decode(field.bytes);
}