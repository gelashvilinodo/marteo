import "server-only";

import {
    Prisma,
    type ProductAttributeType,
} from "@/generated/prisma/client";

export function normalizeAttributeName(value: string) {
    return value
        .normalize("NFC")
        .replace(/\s+/gu, " ")
        .trim()
        .normalize("NFKC")
        .toLowerCase();
}

type AttributeFields = {
    category: string;
    brand: string;
    color: string;
    size: string;
};

export async function saveProductAttributes(
    tx: Prisma.TransactionClient,
    businessId: string,
    fields: AttributeFields,
): Promise<AttributeFields> {
    const result = { ...fields };

    const definitions: {
        field: keyof AttributeFields;
        type: ProductAttributeType;
    }[] = [
        { field: "category", type: "CATEGORY" },
        { field: "brand", type: "BRAND" },
        { field: "color", type: "COLOR" },
        { field: "size", type: "SIZE" },
    ];

    for (const { field, type } of definitions) {
        const name = fields[field]
            .normalize("NFC")
            .replace(/\s+/gu, " ")
            .trim();

        if (!name) {
            result[field] = "";
            continue;
        }

        const normalizedName = normalizeAttributeName(name);

        const attribute = await tx.productAttribute.upsert({
            where: {
                businessId_type_normalizedName: {
                    businessId,
                    type,
                    normalizedName,
                },
            },
            create: {
                businessId,
                type,
                name,
                normalizedName,
            },
            update: {},
            select: {
                name: true,
            },
        });

        // უკვე არსებული მნიშვნელობის დაწერილობას ვინარჩუნებთ.
        result[field] = attribute.name;
    }

    return result;
}