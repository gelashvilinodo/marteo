const MAX_DECODED_BYTES = 64 * 1024 * 1024;

function decodeBlock(
    data: Uint8Array,
    limit: number,
): Uint8Array {
    let position = 0;

    function readByte(): number {
        if (position >= data.length) {
            throw new Error(
                "Numbers-ის შეკუმშული მონაცემები არასრულია.",
            );
        }

        return data[position++];
    }

    let size = 0;
    let scale = 1;

    for (let index = 0; ; index++) {
        if (index >= 5) {
            throw new Error(
                "Numbers-ის შიდა მონაცემების ზომა არასწორია.",
            );
        }

        const byte = readByte();
        size += (byte & 127) * scale;

        if (byte < 128) break;

        scale *= 128;
    }

    if (size > limit) {
        throw new Error(
            "Numbers-ის გახსნილი შიდა მონაცემები ძალიან დიდია.",
        );
    }

    const output = new Uint8Array(size);
    let written = 0;

    while (position < data.length) {
        const tag = readByte();
        const kind = tag & 3;

        let length: number;
        let offset: number;

        if (kind === 0) {
            let value = tag >>> 2;

            if (value < 60) {
                length = value + 1;
            } else {
                const byteCount = value - 59;
                value = 0;

                for (let index = 0; index < byteCount; index++) {
                    value += readByte() * 2 ** (8 * index);
                }

                length = value + 1;
            }

            if (
                position + length > data.length ||
                written + length > size
            ) {
                throw new Error(
                    "Numbers-ის შიდა მონაცემების მონაკვეთი დაზიანებულია.",
                );
            }

            output.set(
                data.subarray(position, position + length),
                written,
            );

            position += length;
            written += length;
            continue;
        }

        if (kind === 1) {
            length = 4 + ((tag >>> 2) & 7);
            offset = ((tag & 224) << 3) + readByte();
        } else {
            length = 1 + (tag >>> 2);
            offset = 0;

            const byteCount = kind === 2 ? 2 : 4;

            for (let index = 0; index < byteCount; index++) {
                offset += readByte() * 2 ** (8 * index);
            }
        }

        if (
            offset < 1 ||
            offset > written ||
            written + length > size
        ) {
            throw new Error(
                "Numbers-ის შეკუმშული მონაცემების კავშირი დაზიანებულია.",
            );
        }

        // გადაფარული მონაკვეთებიც ბაიტების მიმდევრობით იშლება.
        for (let index = 0; index < length; index++) {
            output[written] = output[written - offset];
            written++;
        }
    }

    if (written !== size) {
        throw new Error(
            "Numbers-ის გახსნილი მონაცემების ზომა არ ემთხვევა მოსალოდნელს.",
        );
    }

    return output;
}

export function decodeNumbersIwa(
    data: Uint8Array,
): Uint8Array {
    const parts: Uint8Array[] = [];
    let position = 0;
    let totalBytes = 0;

    while (position < data.length) {
        if (position + 4 > data.length) {
            throw new Error(
                "Numbers-ის შიდა ფაილის სათაური არასრულია.",
            );
        }

        const type = data[position];
        const length =
            data[position + 1] +
            data[position + 2] * 256 +
            data[position + 3] * 65_536;

        position += 4;

        if (type !== 0 || position + length > data.length) {
            throw new Error(
                "Numbers-ის შიდა ფაილის შეკუმშვის ფორმატი არასწორია.",
            );
        }

        const part = decodeBlock(
            data.subarray(position, position + length),
            MAX_DECODED_BYTES - totalBytes,
        );

        position += length;
        totalBytes += part.length;
        parts.push(part);
    }

    const output = new Uint8Array(totalBytes);
    let offset = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }

    return output;
}