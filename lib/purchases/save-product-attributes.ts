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

// ბევრი პროდუქტის მახასიათებლებს ორი მოთხოვნით ინახავს.
export async function saveProductAttributesBatch(
    tx: Prisma.TransactionClient,
    businessId: string,
    items: AttributeFields[],
): Promise<AttributeFields[]> {
    const definitions: {
        field: keyof AttributeFields;
        type: ProductAttributeType;
    }[] = [
        { field: "category", type: "CATEGORY" },
        { field: "brand", type: "BRAND" },
        { field: "color", type: "COLOR" },
        { field: "size", type: "SIZE" },
    ];

    // პირველი დაწერილობა რჩება, როგორც რიგით შენახვისას.
    const wanted = new Map<string, {
        type: ProductAttributeType;
        name: string;
        normalizedName: string;
    }>();

    for (const fields of items) {
        for (const { field, type } of definitions) {
            const name = fields[field]
                .normalize("NFC")
                .replace(/\s+/gu, " ")
                .trim();

            if (!name) continue;

            const normalizedName = normalizeAttributeName(name);
            const key = `${type}:${normalizedName}`;

            if (!wanted.has(key)) {
                wanted.set(key, { type, name, normalizedName });
            }
        }
    }

    const names = new Map<string, string>();

    if (wanted.size > 0) {
        await tx.productAttribute.createMany({
            data: [...wanted.values()].map((attribute) => ({
                businessId,
                ...attribute,
            })),
            skipDuplicates: true,
        });

        const saved = await tx.productAttribute.findMany({
            where: {
                businessId,
                OR: [...wanted.values()].map((attribute) => ({
                    type: attribute.type,
                    normalizedName: attribute.normalizedName,
                })),
            },
            select: {
                type: true,
                normalizedName: true,
                name: true,
            },
        });

        for (const attribute of saved) {
            names.set(
                `${attribute.type}:${attribute.normalizedName}`,
                attribute.name,
            );
        }
    }

    return items.map((fields) => {
        const result = { ...fields };

        for (const { field, type } of definitions) {
            const name = fields[field]
                .normalize("NFC")
                .replace(/\s+/gu, " ")
                .trim();

            result[field] = name
                ? names.get(`${type}:${normalizeAttributeName(name)}`) ?? name
                : "";
        }

        return result;
    });
}
