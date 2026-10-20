import { unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type XlsxPhotoArchive = {
    paths: readonly string[];
    readBytes: (path: string) => Uint8Array | null;
    readXml: (path: string) => unknown;
};

const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

function isRelevantPath(path: string): boolean {
    return (
        path === "xl/workbook.xml" ||
        path === "xl/_rels/workbook.xml.rels" ||
        /^xl\/worksheets\/[^/]+\.xml$/i.test(path) ||
        /^xl\/worksheets\/_rels\/[^/]+\.xml\.rels$/i.test(path) ||
        /^xl\/drawings\/[^/]+\.xml$/i.test(path) ||
        /^xl\/drawings\/_rels\/[^/]+\.xml\.rels$/i.test(path) ||
        path.startsWith("xl/media/")
    );
}

export function readXlsxPhotoArchive(
    buffer: ArrayBuffer,
): XlsxPhotoArchive {
    let totalBytes = 0;
    let entryCount = 0;

    const files = unzipSync(new Uint8Array(buffer), {
        filter(entry) {
            entryCount++;

            if (entryCount > MAX_ENTRIES) {
                throw new Error(
                    "Excel-ის ფაილი ზედმეტად ბევრ შიდა ფაილს შეიცავს.",
                );
            }

            if (!isRelevantPath(entry.name)) return false;

            if (
                !Number.isSafeInteger(entry.originalSize) ||
                entry.originalSize < 0 ||
                entry.originalSize > MAX_ENTRY_BYTES
            ) {
                throw new Error(
                    "Excel-ში ჩაშენებული ერთ-ერთი ფაილი დასამუშავებლად ძალიან დიდია.",
                );
            }

            totalBytes += entry.originalSize;

            if (totalBytes > MAX_TOTAL_BYTES) {
                throw new Error(
                    "Excel-ში ჩაშენებული ფოტოების საერთო ზომა ძალიან დიდია. დაყავი ფაილი რამდენიმე ნაწილად.",
                );
            }

            return true;
        },
    });

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        removeNSPrefix: true,
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: true,
        processEntities: false,
    });

    function readBytes(path: string): Uint8Array | null {
        return Object.prototype.hasOwnProperty.call(files, path)
            ? files[path]
            : null;
    }

    function readXml(path: string): unknown {
        const bytes = readBytes(path);

        if (bytes === null) {
            throw new Error(
                `Excel-ის შიდა ფაილი ვერ მოიძებნა: ${path}`,
            );
        }

        const xml = new TextDecoder("utf-8", {
            fatal: true,
        }).decode(bytes);

        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
            throw new Error(
                "Excel-ის შიდა XML შეიცავს დაუშვებელ დეკლარაციას.",
            );
        }

        if (XMLValidator.validate(xml) !== true) {
            throw new Error(
                `Excel-ის შიდა ფაილი დაზიანებულია: ${path}`,
            );
        }

        return parser.parse(xml) as unknown;
    }

    return {
        paths: Object.keys(files),
        readBytes,
        readXml,
    };
}