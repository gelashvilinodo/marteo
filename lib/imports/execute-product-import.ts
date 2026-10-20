import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError } from "@/lib/orders/order-validation-error";
import { createInventorySkuAllocator } from "@/lib/purchases/create-inventory-sku";
import { validateImportDraftFile } from "./validate-import-draft-file";
import { validateImportDraftSettings } from "./validate-import-draft-settings";
import { checkDraftProducts } from "./check-draft-products";
import { createImportedProduct } from "./create-imported-product";
import {
    buildProductPhotoPlan,
} from "./build-product-photo-plan";
import { applyImportedStock } from "./apply-imported-stock";
import type { PreparedImportProduct } from "./prepare-import-products";
import {
    readImportCompletedSections,
} from "./read-import-completed-sections";

export type ProductImportReceipt = {
    version: 1;
    draftId: string;
    businessId: string;
    sourceRevision: number;
    completedAt: string;
    totalCount: number;
    createdCount: number;
    linkedCount: number;
    excludedCount: number;
    omittedDuplicateCount: number;
    stockChangeCount: number;
    pendingOtherSections: boolean;
};

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function object(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readReceipt(value: unknown): ProductImportReceipt {
    const receipt = object(value);

    if (
        !receipt ||
        receipt.version !== 1 ||
        typeof receipt.draftId !== "string" ||
        typeof receipt.businessId !== "string" ||
        typeof receipt.completedAt !== "string" ||
        !Number.isFinite(Date.parse(receipt.completedAt)) ||
        typeof receipt.pendingOtherSections !== "boolean"
    ) {
        throw new Error("Invalid product import receipt");
    }

    for (const field of [
        "sourceRevision",
        "totalCount",
        "createdCount",
        "linkedCount",
        "excludedCount",
        "omittedDuplicateCount",
        "stockChangeCount",
    ]) {
        const count = receipt[field];

        if (
            typeof count !== "number" ||
            !Number.isSafeInteger(count) ||
            count < 0
        ) {
            throw new Error("Invalid product import receipt count");
        }
    }

    return receipt as unknown as ProductImportReceipt;
}

// მხოლოდ prisma.$transaction-ის შიგნით გამოიძახე.
// წვდომა და დაბლოკვა აქვე ხელახლა მოწმდება.
export async function executeProductImport(
    tx: Prisma.TransactionClient,
    input: {
        userId: string;
        businessId: string;
        draftId: string;
        expectedRevision: number;
    },
): Promise<{
    receipt: ProductImportReceipt;
    replayed: boolean;
}> {
    const {
        userId,
        businessId,
        draftId,
        expectedRevision,
    } = input;

    if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1
    ) {
        fail("მონახაზის მოსალოდნელი ვერსია არასწორია.");
    }

    const business = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT "id" FROM "Business"
        WHERE "id" = ${businessId}
        FOR UPDATE
    `);

    if (business.length === 0) {
        fail("ბიზნესი ვერ მოიძებნა.", 404);
    }

    const membership = await tx.businessMembership.findUnique({
        where: {
            userId_businessId: { userId, businessId },
        },
        select: { role: true },
    });

    if (
        !membership ||
        !["OWNER", "ADMIN"].includes(membership.role)
    ) {
        fail(
            "იმპორტის შესრულება ხელმისაწვდომია მფლობელისა და ადმინისტრატორისთვის.",
            403,
        );
    }

    const locked = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT "id" FROM "ImportJob"
        WHERE "id" = ${draftId}
            AND "businessId" = ${businessId}
        FOR UPDATE
    `);

    if (locked.length === 0) {
        fail("მონახაზი ამ ბიზნესში ვერ მოიძებნა.", 404);
    }

    const saved = await tx.importJob.findUniqueOrThrow({
        where: { id: draftId },
        include: {
            files: {
                include: {
                    photos: true,
                },
                orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                ],
            },
        },
    });

    const previousSummary = object(saved.resultSummary);

    if (previousSummary?.products !== undefined) {
        const receipt = readReceipt(previousSummary.products);

        if (
            receipt.draftId !== draftId ||
            receipt.businessId !== businessId ||
            receipt.sourceRevision !== expectedRevision
        ) {
            fail(
                "ამ მონახაზიდან პროდუქტები უკვე გადმოტანილია. განსხვავებულ ვერსიას ხელახლა არ შევასრულებთ.",
                409,
            );
        }

        return { receipt, replayed: true };
    }

    if (
        saved.schemaVersion !== 1 ||
        !["DRAFT", "REVIEW", "PARTIAL"].includes(saved.status) ||
        (
            saved.expiresAt !== null &&
            saved.expiresAt <= new Date()
        )
    ) {
        fail(
            "მონახაზის მდგომარეობა იმპორტის შესრულების საშუალებას არ იძლევა.",
            409,
        );
    }

    if (saved.revision !== expectedRevision) {
        fail(
            "მონახაზი შეიცვალა. ხელახლა შეინახე და შეამოწმე იმპორტის გეგმა.",
            409,
        );
    }

    if (saved.settings === null) {
        fail("ჯერ შეინახე მონახაზის არჩევანი.");
    }

    const settings = validateImportDraftSettings(
        saved.settings,
        businessId,
    );

    const identities = new Set<string>();

    const files = saved.files.map(stored => {
        const structure = object(stored.structure);
        const clientFileId = structure?.clientFileId;

        if (
            !structure ||
            typeof clientFileId !== "string" ||
            identities.has(clientFileId)
        ) {
            throw new Error("Invalid saved import file identity");
        }

        identities.add(clientFileId);

        const file = validateImportDraftFile(
            structure.parsedFile,
        );

        if (
            file.sha256 !== stored.sha256 ||
            file.originalName !== stored.originalName ||
            file.format !== stored.format ||
            file.byteSize !== stored.byteSize
        ) {
            throw new Error("Saved import file metadata mismatch");
        }

        return {
            clientFileId,
            file,
            photos: stored.photos,
            photoManifest: structure.photoManifest,
        };
    });

    const previouslyImported = await tx.importRecord.count({
        where: {
            jobId: draftId,
            type: "PRODUCT",
            status: "IMPORTED",
        },
    });

    if (previouslyImported > 0) {
        fail(
            "მონახაზზე უკვე არსებობს შესრულებული პროდუქტები. მათი გამეორება შეჩერებულია — შესრულების შედეგი გადასამოწმებელია.",
            409,
        );
    }

    const targetIds = [...new Set(
        Object.values(settings.existingProductLinks).flatMap(
            decision => decision?.action === "LINK"
                ? [decision.inventoryItemId]
                : [],
        ),
    )].sort();

    if (targetIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
            SELECT i."id" FROM "InventoryItem" i
            JOIN "Product" p ON p."id" = i."productId"
            WHERE i."businessId" = ${businessId}
                AND p."businessId" = ${businessId}
                AND i."id" IN (${Prisma.join(targetIds)})
            ORDER BY i."id"
            FOR UPDATE OF i, p
        `);
    }

    const checked = await checkDraftProducts({
        prisma: tx,
        businessId,
        files,
        settings,
    });

    const photoPlan = buildProductPhotoPlan({
        businessId,
        files,
        items: checked.plan.items,
        decisions: settings.productPhotoDecisions ?? [],
    });

    if (photoPlan.problems.length > 0) {
        const first = photoPlan.problems[0];

        fail(
            `ფოტოებზე გადასაწყვეტია ${photoPlan.problems.length} ჩანაწერი. ` +
            `${first.fileName} / ${first.sheetName} — ` +
            (
                first.rowNumber === null
                    ? first.message
                    : `რიგი ${first.rowNumber}: ${first.message}`
            ),
        );
    }

    if (checked.prepared.mappingProblems.length > 0) {
        fail(
            "არჩეულ ფურცლებზე სვეტების პრობლემებია. ჯერ გაასწორე შემოწმებაში ნაჩვენები შესაბამისობები.",
        );
    }

    if (
        checked.plan.items.length === 0 &&
        checked.prepared.excludedRecords.length === 0
    ) {
        fail(
            "შესანახი პროდუქტები არ არის. გადაამოწმე ფურცლების არჩევანი და გამოტოვებული ჩანაწერები.",
        );
    }

    if (
        checked.plan.items.some(
            item => item.action === "BLOCKED",
        )
    ) {
        fail(
            "პროდუქტების იმპორტის გეგმაში გადასაწყვეტი ჩანაწერებია. გაუშვი სერვერული შემოწმება და გაასწორე ნაჩვენები მიზეზები.",
        );
    }

    const rawRows = new Map(
        checked.prepared.sources.flatMap(source =>
            source.sheet.rows.map(row => [
                JSON.stringify([
                    source.fileId,
                    source.sheet.name,
                    row.rowNumber,
                ]),
                row,
            ] as const),
        ),
    );

    async function writeRecord(
        record: PreparedImportProduct,
        status: "IMPORTED" | "SKIPPED",
        result: unknown,
    ) {
        const raw = rawRows.get(record.key);

        if (!raw) {
            throw new Error("Original import row not found");
        }

        const fields = {
            type: "PRODUCT" as const,
            status,
            normalizedData:
                record.data === null
                    ? Prisma.JsonNull
                    : json(record.data),
            proposedLinks: json({
                existing:
                    settings.existingProductLinks[record.key] ??
                    null,
                aliasOf:
                    checked.prepared.aliases[record.key] ??
                    null,
            }),
            issues: json(record.issues),
            result: json(result),
        };

        await tx.importRecord.upsert({
            where: {
                jobId_recordKey: {
                    jobId: draftId,
                    recordKey: record.key,
                },
            },
            create: {
                jobId: draftId,
                recordKey: record.key,
                provenance: json({
                    clientFileId: record.fileId,
                    fileName: record.fileName,
                    sheetName: record.sheetName,
                    rowNumber: record.rowNumber,
                }),
                rawData: json(raw),
                ...fields,
            },
            // საწყისი რიგი შესწორებებით არ გადაიწერება.
            update: fields,
        });
    }

    const nextSku = await createInventorySkuAllocator(
        tx,
        businessId,
    );

    const written = new Map<string, {
        inventoryItemId: string;
        productId: string;
        sku: string;
    }>();

    let stockChangeCount = 0;

    // მხოლოდ დაკავშირება ჯერ, შემდეგ რაოდენობის ცვლილება.
    const items = [...checked.plan.items].sort(
        (left, right) =>
            Number(
                left.action === "LINK" &&
                left.record.mode === "CURRENT_STOCK",
            ) -
            Number(
                right.action === "LINK" &&
                right.record.mode === "CURRENT_STOCK",
            ),
    );

    for (const item of items) {
        if (item.action === "CREATE") {
            const result = await createImportedProduct({
                tx,
                businessId,
                jobId: draftId,
                item,
                stockDate: settings.productStockDate,
                nextSku,
                photo:
                    photoPlan.photosByRecordKey.get(
                        item.record.key,
                    ) ?? null,
                skipPhoto:
                    photoPlan.skippedRecordKeys.has(
                        item.record.key,
                    ),
            });

            written.set(item.record.key, result);

            if (result.quantity > 0) stockChangeCount++;

            await writeRecord(
                item.record,
                "IMPORTED",
                result,
            );
        } else {
            const decision =
                settings.existingProductLinks[item.record.key];

            if (!decision || decision.action !== "LINK") {
                throw new Error(
                    "Validated import link is missing",
                );
            }

            const result = await applyImportedStock({
                tx,
                businessId,
                jobId: draftId,
                item,
                decision,
                policy: settings.productStockPolicy,
                stockDate: settings.productStockDate,
            });

            written.set(item.record.key, result);

            if (result.adjustment !== 0) stockChangeCount++;

            await writeRecord(
                item.record,
                "IMPORTED",
                result,
            );
        }
    }

    for (const record of checked.prepared.excludedRecords) {
        await writeRecord(record, "SKIPPED", {
            reason: "EXCLUDED",
        });
    }

    for (const record of checked.prepared.omittedDuplicates) {
        const aliasOf =
            checked.prepared.aliases[record.key];

        const target = written.get(aliasOf);

        if (!target) {
            throw new Error(
                "Imported duplicate target is missing",
            );
        }

        await writeRecord(record, "SKIPPED", {
            reason: "DUPLICATE",
            aliasOf,
            ...target,
        });
    }

    const completedSections = readImportCompletedSections(
        saved.resultSummary,
        {
            draftId,
            businessId,
            revision: saved.revision,
        },
    );

    const customersSelected =
        Object.values(settings.customerMappings).some(
            sheets =>
                Object.values(sheets).some(
                    mapping => mapping.enabled,
                ),
        );

    const ordersSelected = Object.values(
        settings.orderMappings ?? {},
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const pendingOtherSections =
        (
            customersSelected &&
            !completedSections.customers
        ) ||
        (
            ordersSelected &&
            !completedSections.orders
        );

    const receipt: ProductImportReceipt = {
        version: 1,
        draftId,
        businessId,
        sourceRevision: expectedRevision,
        completedAt: new Date().toISOString(),
        totalCount: checked.plan.items.length,
        createdCount: checked.plan.createCount,
        linkedCount: checked.plan.linkCount,
        excludedCount:
            checked.prepared.excludedRecords.length,
        omittedDuplicateCount:
            checked.prepared.omittedDuplicates.length,
        stockChangeCount,
        pendingOtherSections,
    };

    await tx.importJob.update({
        where: { id: draftId },
        data: {
            status:
                pendingOtherSections
                    ? "PARTIAL"
                    : "COMPLETED",
            confirmedRevision: expectedRevision,
            revision: { increment: 1 },
            startedAt: saved.startedAt ?? new Date(),
            finishedAt:
                pendingOtherSections ? null : new Date(),
            resultSummary: json({
                ...previousSummary,
                products: receipt,
            }),
        },
    });

    return { receipt, replayed: false };
}