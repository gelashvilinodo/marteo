import type {
    NumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    numbersProtoText,
    numbersProtoUnsigned,
    readNumbersProtobuf,
} from "./read-numbers-protobuf";

export type NumbersPhotoMedia = {
    id: number;
    sourcePath: string;
    originalName: string;
    bytes: Uint8Array | null;
};

export function readNumbersPhotoMedia(
    index: NumbersPhotoIndex,
): Map<number, NumbersPhotoMedia> {
    const packages = index.packetsById.get(2) ?? [];

    const messages = packages.flatMap(packet =>
        packet.messages.filter(message => message.type === 11006),
    );

    if (messages.length !== 1) {
        throw new Error(
            "Numbers-ის ფოტოების ფაილების სია ერთმნიშვნელოვნად ვერ განვსაზღვრეთ.",
        );
    }

    const metadata = readNumbersProtobuf(messages[0].bytes);
    const result = new Map<number, NumbersPhotoMedia>();

    for (const field of metadata.get(4) ?? []) {
        if (field.wireType !== 2) {
            throw new Error(
                "Numbers-ის ფოტოების სიის სტრუქტურა არასწორია.",
            );
        }

        const data = readNumbersProtobuf(field.bytes);
        const id = numbersProtoUnsigned(data, 1);
        const preferredName = numbersProtoText(data, 3);
        const storedName = numbersProtoText(data, 4);

        // Numbers-ის საკუთარი რესურსის ჩანაწერს
        // შესაძლოა არქივში ფაილი საერთოდ არ ახლდეს.
        // თუ უჯრედი მას ფოტოდ მოითხოვს, მოგვიანებით
        // შესაბამისი რიგისთვის გაფრთხილებას გამოვიტანთ.
        if (!storedName) continue;

        if (
            id === null ||
            id < 1 ||
            !storedName ||
            /[/\\\u0000-\u001f]/.test(storedName) ||
            storedName === "." ||
            storedName === ".."
        ) {
            throw new Error(
                "Numbers-ის ერთ-ერთი მედია ფაილის აღწერა არასრულია ან არასწორია.",
            );
        }

        if (result.has(id)) {
            throw new Error(
                "Numbers-ის მედია ფაილის კოდი მეორდება.",
            );
        }

        const sourcePath = `Data/${storedName}`;

        result.set(id, {
            id,
            sourcePath,
            originalName: preferredName || storedName,
            bytes: index.archive.readBytes(sourcePath),
        });
    }

    return result;
}