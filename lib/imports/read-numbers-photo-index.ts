import { decodeNumbersIwa } from "./decode-numbers-iwa";
import {
    readNumbersIwaPackets,
    type NumbersIwaPacket,
} from "./read-numbers-iwa-packets";
import {
    readNumbersPhotoArchive,
    type NumbersPhotoArchive,
} from "./read-numbers-photo-archive";

export type NumbersPhotoIndex = {
    archive: NumbersPhotoArchive;

    // ერთ კოდს შეიძლება რამდენიმე დამატებითი ჩანაწერი ჰქონდეს.
    // ყველა ვერსიას ვინარჩუნებთ.
    packetsById: ReadonlyMap<
        number,
        readonly NumbersIwaPacket[]
    >;

    decodedByteSize: number;
};

const MAX_TOTAL_DECODED_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_PACKETS = 200_000;

export function readNumbersPhotoIndex(
    buffer: ArrayBuffer,
): NumbersPhotoIndex {
    const archive = readNumbersPhotoArchive(buffer);
    const packetsById = new Map<number, NumbersIwaPacket[]>();

    let decodedByteSize = 0;
    let packetCount = 0;

    for (const path of archive.paths) {
        if (
            !path.startsWith("Index/") ||
            !path.endsWith(".iwa")
        ) {
            continue;
        }

        const compressed = archive.readBytes(path);

        if (compressed === null) {
            throw new Error(
                "Numbers-ის ერთ-ერთი შიდა ფაილი ვერ მოიძებნა.",
            );
        }

        const decoded = decodeNumbersIwa(compressed);
        decodedByteSize += decoded.byteLength;

        if (decodedByteSize > MAX_TOTAL_DECODED_BYTES) {
            throw new Error(
                "Numbers-ის გახსნილი მონაცემების საერთო ზომა ძალიან დიდია. დაყავი ფაილი რამდენიმე ნაწილად.",
            );
        }

        const packets = readNumbersIwaPackets(decoded);
        packetCount += packets.length;

        if (packetCount > MAX_TOTAL_PACKETS) {
            throw new Error(
                "Numbers-ის ფაილი დასამუშავებლად ზედმეტად ბევრ შიდა ჩანაწერს შეიცავს.",
            );
        }

        for (const packet of packets) {
            const existing = packetsById.get(packet.id);

            if (existing) {
                existing.push(packet);
            } else {
                packetsById.set(packet.id, [packet]);
            }
        }
    }

    if (packetsById.size === 0) {
        throw new Error(
            "Numbers-ის ფოტოების კავშირების წასაკითხად საჭირო ჩანაწერები ვერ მოიძებნა.",
        );
    }

    return {
        archive,
        packetsById,
        decodedByteSize,
    };
}