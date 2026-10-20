import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    readImportCompletedSections,
} from "./read-import-completed-sections";
import {
    validateImportDraftSettings,
} from "./validate-import-draft-settings";
import {
    readOrderDraftFiles,
} from "./read-order-draft-files";
import {
    checkDraftOrders,
} from "./check-draft-orders";
import {
    createImportedManualOrder,
} from "./create-imported-manual-order";
import {
    applyOrderCustomerPlan,
} from "./apply-order-customer-plan";

export type OrderImportReceipt = {
    version: 1;
    draftId: string;
    businessId: string;
    sourceRevision: number;
    completedAt: string;
    totalCount: number;
    createdCount: number;
    linkedCount: number;
    excludedCount: number;
    skippedCount: number;
    pendingCostCount: number;
    customerCreatedCount?: number;
    customerLinkedCount?: number;
    customerSkippedCount?: number;
    pendingOtherSections: boolean;
};

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new Error("იმპორტის შედეგის სტრუქტურა არასწორია.");
    }

    return value as Record<string, unknown>;
}

function json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// მხოლოდ prisma.$transaction-ის შიგნით გამოიძახება.
export async function executeOrderImport(
    tx: Prisma.TransactionClient,
    input: {
        userId: string;
        businessId: string;
        draftId: string;
        expectedRevision: number;
    },
): Promise<{
    receipt: OrderImportReceipt;
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

    const business = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
            SELECT "id" FROM "Business"
            WHERE "id" = ${businessId}
            FOR UPDATE
        `,
    );

    if (business.length === 0) fail("ბიზნესი ვერ მოიძებნა.", 404);

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
            "შეკვეთების იმპორტი ხელმისაწვდომია მფლობელისა და ადმინისტრატორისთვის.",
            403,
        );
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
            SELECT "id" FROM "ImportJob"
            WHERE "id" = ${draftId}
                AND "businessId" = ${businessId}
            FOR UPDATE
        `,
    );

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

    const previousSummary = saved.resultSummary === null
        ? {}
        : object(saved.resultSummary);

    const completed = readImportCompletedSections(
        saved.resultSummary,
        {
            draftId,
            businessId,
            revision: saved.revision,
        },
    );

    if (completed.orders) {
        const previous = object(previousSummary.orders);

        for (const field of ["skippedCount", "pendingCostCount"]) {
            const count = previous[field];

            if (
                typeof count !== "number" ||
                !Number.isSafeInteger(count) ||
                count < 0
            ) {
                throw new Error(
                    "შეკვეთების შესრულების რაოდენობები ვერ დადასტურდა.",
                );
            }
        }

        for (const field of [
            "customerCreatedCount",
            "customerLinkedCount",
            "customerSkippedCount",
        ]) {
            const count = previous[field];

            if (
                count !== undefined &&
                (
                    typeof count !== "number" ||
                    !Number.isSafeInteger(count) ||
                    count < 0
                )
            ) {
                throw new Error(
                    "შეკვეთების მომხმარებლების შესრულების რაოდენობები ვერ დადასტურდა.",
                );
            }
        }


        if (previous.sourceRevision !== expectedRevision) {
            fail(
                "ამ მონახაზიდან შეკვეთები უკვე გადმოტანილია. განსხვავებულ ვერსიას ხელახლა არ შევასრულებთ.",
                409,
            );
        }

        return {
            receipt: previous as unknown as OrderImportReceipt,
            replayed: true,
        };
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
            "მონახაზის მდგომარეობა შეკვეთების იმპორტის საშუალებას არ იძლევა.",
            409,
        );
    }

    if (saved.revision !== expectedRevision) {
        fail(
            "მონახაზი შეიცვალა. ხელახლა გახსენი და შეკვეთები თავიდან შეამოწმე.",
            409,
        );
    }

    if (saved.settings === null) {
        fail("ჯერ შეინახე მონახაზის არჩევანები და შესწორებები.");
    }

    const settings = validateImportDraftSettings(
        saved.settings,
        businessId,
    );

    const files = readOrderDraftFiles(saved.files);

    const imported = await tx.importRecord.count({
        where: {
            jobId: draftId,
            type: "ORDER",
            status: "IMPORTED",
        },
    });

    if (imported > 0) {
        fail(
            "შეკვეთების შესრულებული ჩანაწერები უკვე არსებობს, მაგრამ საბოლოო შედეგი ვერ დადასტურდა. გამეორება შეჩერებულია.",
            409,
        );
    }

    const checked = await checkDraftOrders({
        prisma: tx,
        businessId,
        jobId: draftId,
        files,
        settings,
    });

    if (!checked.canImport) {
        fail(
            checked.problems[0] ??
            "შეკვეთების იმპორტი ჯერ დასაზუსტებელია.",
        );
    }

    const sourceRows = new Map(
        [
            ...checked.prepared.sourceRows.values(),
            ...checked.prepared.excludedRows,
        ].map(row => [row.key, row]),
    );

    const originalRows = new Map(
        files.flatMap(({ clientFileId, file }) =>
            file.sheets.flatMap(sheet =>
                sheet.rows.map(row => [
                    JSON.stringify([
                        clientFileId,
                        sheet.name,
                        row.rowNumber,
                    ]),
                    row,
                ] as const),
            ),
        ),
    );

    async function audit(
        recordKey: string,
        rowKeys: string[],
        status: "IMPORTED" | "SKIPPED",
        normalized: unknown,
        result: unknown,
    ) {
        const rows = rowKeys.map(key => {
            const source = sourceRows.get(key);
            const original = originalRows.get(key);

            if (!source || !original) {
                throw new Error("შეკვეთის საწყისი რიგი ვერ მოიძებნა.");
            }

            return { source, original };
        });

        const fields = {
            status,
            normalizedData: normalized === null
                ? Prisma.JsonNull
                : json(normalized),
            issues: json(rows.flatMap(row => row.source.issues)),
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
                type: "ORDER",
                provenance: json(rows.map(({ source }) => ({
                    sourceRowKey: source.key,
                    clientFileId: source.fileId,
                    fileName: source.fileName,
                    sheetName: source.sheetName,
                    rowNumber: source.rowNumber,
                }))),
                rawData: json(rows.map(row => row.original)),
                ...fields,
            },
            update: fields,
        });
    }

    const appliedCustomers = await applyOrderCustomerPlan({
        tx,
        businessId,
        items: checked.customerPlan.items,
    });

    const customerPlanByOrderKey = new Map<
        string,
        typeof checked.customerPlan.items[number]
    >();

    for (const item of checked.customerPlan.items) {
        for (const orderKey of item.orderKeys) {
            customerPlanByOrderKey.set(orderKey, item);
        }
    }


    let createdCount = 0;
    let skippedCount = 0;
    let pendingCostCount = 0;

    for (const order of checked.prepared.orders) {
        const rowKeys = order.group.rows.map(row => row.key);
        const recordKey = JSON.stringify([
            "ORDER_GROUP",
            order.group.key,
        ]);

        if (order.result.kind === "SKIPPED") {
            await audit(
                recordKey,
                rowKeys,
                "SKIPPED",
                null,
                { reason: order.result.message },
            );

            skippedCount++;
            continue;
        }

        if (order.result.kind !== "PREVIEW_READY") {
            fail("შეკვეთის გეგმა ჯერ დასაზუსტებელია.");
        }

        const customerId =
            appliedCustomers.customerByOrderKey.get(order.group.key) ??
            null;

        const customerPlan = customerPlanByOrderKey.get(
            order.group.key,
        );

        const created = await createImportedManualOrder({
            tx,
            businessId,
            jobId: draftId,
            order,
            customerId,
        });

        await audit(
            recordKey,
            rowKeys,
            "IMPORTED",
            order.result.data,
            {
                ...created,
                customer: {
                    id: customerId,
                    action: customerPlan?.action ?? "NO_CUSTOMER_DATA",
                    createdProfile:
                        customerPlan?.action === "CREATE"
                            ? customerPlan.data
                            : null,
                },
            },
        );

        createdCount++;

        if (created.analyticsPendingCost) pendingCostCount++;
    }

    for (const row of checked.prepared.excludedRows) {
        await audit(
            JSON.stringify(["ORDER_ROW", row.key]),
            [row.key],
            "SKIPPED",
            null,
            { reason: "EXCLUDED_BY_USER" },
        );
    }

    const customersSelected = Object.values(
        settings.customerMappings,
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const productsSelected = Object.values(
        settings.productMappings,
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    const pendingOtherSections =
        (customersSelected && !completed.customers) ||
        (productsSelected && !completed.products);

    const completedAt = new Date();

    const receipt: OrderImportReceipt = {
        version: 1,
        draftId,
        businessId,
        sourceRevision: expectedRevision,
        completedAt: completedAt.toISOString(),
        totalCount: createdCount,
        createdCount,
        linkedCount: 0,
        excludedCount: checked.prepared.excludedRows.length,
        skippedCount,
        pendingCostCount,
        customerCreatedCount: appliedCustomers.createdCount,
        customerLinkedCount: appliedCustomers.linkedCount,
        customerSkippedCount: appliedCustomers.skippedCount,
        pendingOtherSections,
    };

    await tx.importJob.update({
        where: { id: draftId },
        data: {
            status: pendingOtherSections ? "PARTIAL" : "COMPLETED",
            revision: { increment: 1 },
            confirmedRevision: expectedRevision,
            startedAt: saved.startedAt ?? completedAt,
            finishedAt: pendingOtherSections ? null : completedAt,
            resultSummary: json({
                ...previousSummary,
                orders: receipt,
            }),
        },
    });

    return { receipt, replayed: false };
}