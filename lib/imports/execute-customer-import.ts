import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError } from "@/lib/orders/order-validation-error";

import { validateImportDraftFile } from "./validate-import-draft-file";
import { validateImportDraftSettings } from "./validate-import-draft-settings";
import { checkDraftCustomers } from "./check-draft-customers";
import { applyImportedCustomer } from "./apply-imported-customer";

import type {
    PreparedImportCustomer,
} from "./prepare-import-customers";

import {
    readImportCompletedSections,
} from "./read-import-completed-sections";

export type CustomerImportReceipt = {
    version: 1;
    draftId: string;
    businessId: string;
    sourceRevision: number;
    completedAt: string;
    totalCount: number;
    createdCount: number;
    linkedCount: number;
    excludedCount: number;
    pendingOtherSections: boolean;
};

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function object(
    value: unknown,
): Record<string, unknown> | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
        JSON.stringify(value),
    ) as Prisma.InputJsonValue;
}

function readReceipt(value: unknown): CustomerImportReceipt {
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
        throw new Error("Invalid customer import receipt");
    }

    for (const field of [
        "sourceRevision",
        "totalCount",
        "createdCount",
        "linkedCount",
        "excludedCount",
    ]) {
        const value = receipt[field];

        if (
            typeof value !== "number" ||
            !Number.isSafeInteger(value) ||
            value < 0
        ) {
            throw new Error(
                "Invalid customer import receipt count",
            );
        }
    }

    const result = receipt as unknown as CustomerImportReceipt;

    if (
        result.sourceRevision < 1 ||
        result.createdCount + result.linkedCount !==
        result.totalCount
    ) {
        throw new Error(
            "Inconsistent customer import receipt",
        );
    }

    return result;
}

// მხოლოდ prisma.$transaction-ის შიგნით გამოიძახე.
export async function executeCustomerImport(
    tx: Prisma.TransactionClient,
    input: {
        userId: string;
        businessId: string;
        draftId: string;
        expectedRevision: number;
    },
): Promise<{
    receipt: CustomerImportReceipt;
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
        SELECT "id"
        FROM "Business"
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
            "მომხმარებლების იმპორტი ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
            403,
        );
    }

    const locked = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT "id"
        FROM "ImportJob"
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
                orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                ],
            },
        },
    });

    const previousSummary = object(saved.resultSummary);

    if (previousSummary?.customers !== undefined) {
        const receipt = readReceipt(
            previousSummary.customers,
        );

        if (
            receipt.draftId !== draftId ||
            receipt.businessId !== businessId ||
            receipt.sourceRevision !== expectedRevision
        ) {
            fail(
                "ამ მონახაზიდან მომხმარებლები უკვე გადმოტანილია. განსხვავებულ ვერსიას ხელახლა არ შევასრულებთ.",
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
            saved.expiresAt.getTime() <= Date.now()
        )
    ) {
        fail(
            "მონახაზის მდგომარეობა მომხმარებლების იმპორტის შესრულების საშუალებას არ იძლევა.",
            409,
        );
    }

    if (saved.revision !== expectedRevision) {
        fail(
            "მონახაზი შეიცვალა. მომხმარებლების იმპორტის გეგმა ხელახლა შეამოწმე.",
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
            throw new Error(
                "Invalid saved customer import file identity",
            );
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
            throw new Error(
                "Saved customer import file metadata mismatch",
            );
        }

        return { clientFileId, file };
    });

    const importedCount = await tx.importRecord.count({
        where: {
            jobId: draftId,
            type: "CUSTOMER",
            status: "IMPORTED",
        },
    });

    if (importedCount > 0) {
        fail(
            "ამ მონახაზზე შესრულებული მომხმარებლები უკვე არსებობს, მაგრამ საბოლოო შედეგი ვერ დადასტურდა. გამეორება შეჩერებულია.",
            409,
        );
    }

    const targetIds = [...new Set(
        Object.values(settings.existingCustomerLinks)
            .flatMap(link => link ? [link.customerId] : []),
    )].sort();

    if (targetIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
            SELECT "id"
            FROM "Customer"
            WHERE "businessId" = ${businessId}
              AND "id" IN (${Prisma.join(targetIds)})
            ORDER BY "id"
            FOR UPDATE
        `);
    }

    const checked = await checkDraftCustomers({
        prisma: tx,
        businessId,
        files,
        settings,
    });

    if (checked.prepared.mappingProblems.length > 0) {
        const first = checked.prepared.mappingProblems[0];

        fail(
            `${first.fileName} / ${first.sheetName}: ${first.message}`,
        );
    }

    if (
        checked.plan.items.length === 0 &&
        checked.prepared.excludedRecords.length === 0
    ) {
        fail(
            "შესანახი მომხმარებლები არ არის. გადაამოწმე ფურცლების არჩევანი და გამოტოვებული ჩანაწერები.",
        );
    }

    const blocked = checked.plan.items.find(
        item => item.action === "BLOCKED",
    );

    if (blocked) {
        fail(
            `${blocked.record.fileName} / ` +
            `${blocked.record.sheetName} - ` +
            `რიგი ${blocked.record.rowNumber}: ${blocked.reason}`,
        );
    }

    const sourceRows = new Map<string, unknown>();

    for (const source of checked.prepared.sources) {
        for (const row of source.sheet.rows) {
            sourceRows.set(
                JSON.stringify([
                    source.fileId,
                    source.sheet.name,
                    row.rowNumber,
                ]),
                row,
            );
        }
    }

    async function writeRecord(
        record: PreparedImportCustomer,
        status: "IMPORTED" | "SKIPPED",
        result: unknown,
    ) {
        const rawRow = sourceRows.get(record.key);

        if (!rawRow) {
            throw new Error(
                "Customer import source row is missing",
            );
        }

        // მომხმარებლისა და პროდუქტის ჩანაწერები ერთსა და იმავე
        // წყაროს რიგზეც შეიძლება იყოს. მათი კოდები არ უნდა დაემთხვეს.
        const recordKey = JSON.stringify([
            "CUSTOMER",
            record.key,
        ]);

        const values = {
            status,
            normalizedData: record.data === null
                ? Prisma.JsonNull
                : json(record.data),
            proposedLinks: json({
                existing:
                    record.data === null
                        ? null
                        : settings.existingCustomerLinks[
                        record.data.phone
                        ] ?? null,
            }),
            issues: json(record.issues),
            result: json(result),
        };

        await tx.importRecord.upsert({
            where: {
                jobId_recordKey: {
                    jobId: draftId,
                    recordKey,
                },
            },
            create: {
                jobId: draftId,
                recordKey,
                type: "CUSTOMER",
                provenance: json({
                    sourceRecordKey: record.key,
                    clientFileId: record.fileId,
                    fileName: record.fileName,
                    sheetName: record.sheetName,
                    rowNumber: record.rowNumber,
                    sourceCode: record.sourceCode,
                }),
                rawData: json(rawRow),
                ...values,
            },
            update: values,
        });
    }

    let createdCount = 0;
    let linkedCount = 0;

    for (const item of checked.plan.items) {
        const phone = item.record.data?.phone;

        const applied = await applyImportedCustomer({
            tx,
            businessId,
            item,
            existingLink: phone
                ? settings.existingCustomerLinks[phone] ?? null
                : null,
        });

        if (applied.action === "CREATE") createdCount++;
        else linkedCount++;

        await writeRecord(
            item.record,
            "IMPORTED",
            applied,
        );
    }

    for (const record of checked.prepared.excludedRecords) {
        await writeRecord(record, "SKIPPED", {
            reason: "EXCLUDED_BY_USER",
        });
    }

    const productsSelected = Object.values(
        settings.productMappings,
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const completedSections = readImportCompletedSections(
        saved.resultSummary,
        {
            draftId,
            businessId,
            revision: saved.revision,
        },
    );

    const ordersSelected = Object.values(
        settings.orderMappings ?? {},
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const pendingOtherSections =
        (
            productsSelected &&
            !completedSections.products
        ) ||
        (
            ordersSelected &&
            !completedSections.orders
        );

    const completedAt = new Date();

    const receipt: CustomerImportReceipt = {
        version: 1,
        draftId,
        businessId,
        sourceRevision: expectedRevision,
        completedAt: completedAt.toISOString(),
        totalCount: checked.plan.items.length,
        createdCount,
        linkedCount,
        excludedCount: checked.prepared.excludedRecords.length,
        pendingOtherSections,
    };

    await tx.importJob.update({
        where: { id: draftId },
        data: {
            status: pendingOtherSections
                ? "PARTIAL"
                : "COMPLETED",
            revision: { increment: 1 },
            confirmedRevision: expectedRevision,
            startedAt: saved.startedAt ?? completedAt,
            finishedAt: pendingOtherSections
                ? null
                : completedAt,
            resultSummary: json({
                ...(previousSummary ?? {}),
                customers: receipt,
            }),
        },
    });

    return {
        receipt,
        replayed: false,
    };
}