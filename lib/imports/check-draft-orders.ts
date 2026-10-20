import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    fingerprint,
} from "@/lib/orders/order-rules";
import {
    prepareDraftOrders,
} from "./prepare-draft-orders";
import type {
    OrderDraftFile,
} from "./prepare-draft-order-rows";
import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";
import {
    prepareOrderCustomers,
} from "./prepare-order-customers";
import {
    checkOrderCustomers,
} from "./check-order-customers";
import {
    buildOrderCustomerPlan,
} from "./build-order-customer-plan";

import { linkOrderCustomersFromImport } from "./link-order-customers-from-import";

export async function checkDraftOrders(input: {
    prisma: Pick<Prisma.TransactionClient, "order" | "$queryRaw" | "importRecord">;
    businessId: string;
    jobId: string;
    files: readonly OrderDraftFile[];
    settings: ImportDraftSettings;
}) {
    const prepared = prepareDraftOrders({
        files: input.files,
        settings: input.settings,
    });

    const problems: string[] = [];
    const orderCustomers = prepareOrderCustomers(prepared.orders);

    const customerCheck = await checkOrderCustomers({
        prisma: input.prisma,
        businessId: input.businessId,
        candidates: orderCustomers.candidates,
    });

    const previouslyImportedCustomers = orderCustomers.candidates.length === 0 ? [] : await input.prisma.importRecord.findMany({
        where: { jobId: input.jobId, type: "CUSTOMER", status: "IMPORTED", job: { businessId: input.businessId } },
        select: { normalizedData: true, result: true },
    });
    const customerDecisions = linkOrderCustomersFromImport({
        businessId: input.businessId, candidates: customerCheck.candidates,
        skipCustomers: input.settings.skipOrderCustomers === true,
        decisions: input.settings.orderCustomerDecisions ?? {}, imported: previouslyImportedCustomers,
    });
    const customerPlan = buildOrderCustomerPlan({
        businessId: input.businessId,
        candidates: customerCheck.candidates,
        decisions: customerDecisions,
    });

    for (const item of customerPlan.items) {
        if (item.action === "BLOCKED") {
            problems.push(
                `${item.phone}: ${item.reason ?? "მომხმარებელთან კავშირი დასაზუსტებელია."}`,
            );
        }
    }

    const selected = Object.values(
        input.settings.orderMappings ?? {},
    ).some(sheets =>
        Object.values(sheets).some(mapping => mapping.enabled),
    );

    if (!selected) {
        problems.push(
            "შეკვეთების გადასატანად არც ერთი ფურცელი არ არის მონიშნული.",
        );
    }

    for (const problem of prepared.mappingProblems) {
        problems.push(
            `${problem.fileName} / ${problem.sheetName}: ${problem.message}`,
        );
    }

    for (const problem of prepared.groupingProblems) {
        const row = prepared.sourceRows.get(problem.rowKey);

        problems.push(
            (
                row
                    ? `${row.fileName} / ${row.sheetName} — რიგი ${row.rowNumber}: `
                    : ""
            ) + problem.message,
        );
    }

    const candidates: {
        groupKey: string;
        clientRequestId: string;
    }[] = [];

    for (const order of prepared.orders) {
        if (order.result.kind === "SKIPPED") continue;

        const location =
            `${order.fileName} / ${order.group.rows[0]?.sheetName}` +
            ` — რიგები ${order.group.rows.map(row => row.rowNumber).join(", ")}`;

        if (order.result.kind === "NEEDS_REVIEW") {
            problems.push(
                ...order.result.messages.map(
                    message => `${location}: ${message}`,
                ),
            );
            continue;
        }

        if (
            order.group.requiresConfirmation &&
            !order.groupingConfirmed
        ) {
            problems.push(
                `${location}: ჯერ დაადასტურე, რომ დაჯგუფებული რიგები ერთი შეკვეთაა.`,
            );
        }

        candidates.push({
            groupKey: order.group.key,
            clientRequestId: await fingerprint({
                kind: "IMPORTED_MANUAL_ORDER",
                jobId: input.jobId,
                groupKey: order.group.key,
            }),
        });
    }

    const existingIds = new Set<string>();

    for (let offset = 0; offset < candidates.length; offset += 500) {
        const batch = candidates.slice(offset, offset + 500);

        const existing = await input.prisma.order.findMany({
            where: {
                businessId: input.businessId,
                clientRequestId: {
                    in: batch.map(item => item.clientRequestId),
                },
            },
            select: { clientRequestId: true },
        });

        for (const order of existing) {
            if (order.clientRequestId !== null) {
                existingIds.add(order.clientRequestId);
            }
        }
    }

    if (existingIds.size > 0) {
        problems.push(
            `ამ მონახაზიდან ${existingIds.size} შეკვეთა უკვე არსებობს. ` +
            "განმეორებით შექმნა შეჩერებულია; ჯერ შესრულების შენახული შედეგი უნდა გადამოწმდეს.",
        );
    }

    if (
        prepared.orders.length === 0 &&
        prepared.excludedRows.length === 0 &&
        problems.length === 0
    ) {
        problems.push(
            "მონიშნულ ფურცლებზე შეკვეთების შესანახი ან გამოტოვებული რიგები ვერ მოიძებნა.",
        );
    }

    return {
        prepared,
        customerCheck,
        customerPlan,
        withoutCustomerData: orderCustomers.withoutCustomerData,
        problems: [...new Set(problems)],
        canImport: problems.length === 0,
        createCount: candidates.length,
        existingCount: existingIds.size,
    };
}