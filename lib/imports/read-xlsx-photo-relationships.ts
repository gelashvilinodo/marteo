import type { XlsxPhotoArchive } from "./read-xlsx-photo-archive";

export type XlsxPhotoRelationship = {
    id: string;
    type: string;
    targetPath: string | null;
    external: boolean;
};

export function asXmlObject(
    value: unknown,
): Record<string, unknown> | null {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return null;
    }

    return value as Record<string, unknown>;
}

export function asXmlArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

export function xmlString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function resolveTarget(
    sourcePath: string,
    target: string,
): string {
    if (
        !target ||
        /[\\?#\u0000-\u001f]/.test(target) ||
        /^[a-z][a-z0-9+.-]*:/i.test(target) ||
        target.startsWith("//")
    ) {
        throw new Error(
            "Excel-ის ფოტოს შიდა მისამართი არასწორია.",
        );
    }

    const parts = target.startsWith("/")
        ? []
        : sourcePath.split("/").slice(0, -1);

    for (const part of target.split("/")) {
        if (part === "" || part === ".") continue;

        if (part === "..") {
            if (parts.length === 0) {
                throw new Error(
                    "Excel-ის ფოტოს მისამართი ფაილის საზღვრებს სცდება.",
                );
            }

            parts.pop();
            continue;
        }

        parts.push(part);
    }

    if (parts.length === 0) {
        throw new Error(
            "Excel-ის ფოტოს შიდა მისამართი ცარიელია.",
        );
    }

    return parts.join("/");
}

export function readXlsxPhotoRelationships(
    archive: XlsxPhotoArchive,
    sourcePath: string,
): Map<string, XlsxPhotoRelationship> {
    const separator = sourcePath.lastIndexOf("/");
    const directory = separator < 0
        ? ""
        : sourcePath.slice(0, separator + 1);
    const fileName = sourcePath.slice(separator + 1);

    const relationshipsPath =
        `${directory}_rels/${fileName}.rels`;

    const result = new Map<string, XlsxPhotoRelationship>();

    if (archive.readBytes(relationshipsPath) === null) {
        return result;
    }

    const document = asXmlObject(
        archive.readXml(relationshipsPath),
    );
    const root = asXmlObject(document?.Relationships);

    if (root === null) {
        throw new Error(
            "Excel-ის ფოტოების კავშირების სტრუქტურა დაზიანებულია.",
        );
    }

    for (const value of asXmlArray(root.Relationship)) {
        const item = asXmlObject(value);
        const id = xmlString(item?.["@_Id"]);
        const type = xmlString(item?.["@_Type"]);
        const target = xmlString(item?.["@_Target"]);
        const targetMode = xmlString(item?.["@_TargetMode"]);

        if (!id || !type || !target || result.has(id)) {
            throw new Error(
                "Excel-ის ფოტოების ერთ-ერთი კავშირი არასწორია ან მეორდება.",
            );
        }

        const external = targetMode === "External";

        if (
            targetMode !== null &&
            targetMode !== "Internal" &&
            !external
        ) {
            throw new Error(
                "Excel-ის ფოტოს კავშირის ტიპი ვერ ამოვიცანით.",
            );
        }

        result.set(id, {
            id,
            type,
            external,
            targetPath: external
                ? null
                : resolveTarget(sourcePath, target),
        });
    }

    return result;
}