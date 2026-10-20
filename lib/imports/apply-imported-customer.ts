import "server-only";

import type {
    Prisma,
} from "@/generated/prisma/client";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import {
    normalizeCustomerPhone,
} from "@/lib/orders/validate-order";

import {
    validateImportCustomer,
} from "./validate-import-customer";

import type {
    CustomerImportPlanItem,
} from "./build-customer-import-plan";

import type {
    ImportExistingCustomerLink,
} from "./import-types";

export type AppliedImportCustomer = {
    action: "CREATE" | "LINK";
    customerId: string;
    phone: string;
};

// გამოიძახე მხოლოდ ავტორიზებულ ტრანზაქციაში:
// ბიზნესი დაბლოკილი და იმპორტის გეგმა ხელახლა შემოწმებული უნდა იყოს.
export async function applyImportedCustomer({
    tx,
    businessId,
    item,
    existingLink = null,
}: {
    tx: Prisma.TransactionClient;
    businessId: string;
    item: CustomerImportPlanItem;
    existingLink?: ImportExistingCustomerLink | null;
}): Promise<AppliedImportCustomer> {
    const record = item.record;

    function fail(message: string, status = 422): never {
        throw new OrderValidationError(
            `${record.fileName} / ${record.sheetName} — რიგი ${record.rowNumber}: ${message}`,
            status,
        );
    }

    if (
        record.status !== "READY" ||
        record.data === null ||
        item.action === "BLOCKED"
    ) {
        fail("მომხმარებლის შენახვა ჯერ დადასტურებული არ არის.");
    }

    const validated = validateImportCustomer(record.data);

    if (!validated.valid || validated.data === null) {
        fail(
            validated.issues
                .filter(issue => issue.severity === "ERROR")
                .map(issue => issue.message)
                .join(" ") ||
            "მომხმარებლის სავალდებულო მონაცემები შესასწორებელია.",
        );
    }

    const data = validated.data;

    if (data.phone !== record.data.phone) {
        fail("ტელეფონის ფორმატი შეიცვალა. საჭიროა ხელახლა შემოწმება.");
    }

    if (item.action === "CREATE") {
        if (item.customerId !== null) {
            fail("ახალი მომხმარებლის გეგმაში არსებული მომხმარებლის კოდია მითითებული.");
        }

        const customer = await tx.customer.create({
            data: {
                businessId,
                phone: data.phone,
                address: data.address,
                firstName: data.firstName,
                lastName: data.lastName,
            },
            select: {
                id: true,
                phone: true,
            },
        });

        return {
            action: "CREATE",
            customerId: customer.id,
            phone: customer.phone,
        };
    }

    if (
        item.customerId === null ||
        existingLink === null ||
        existingLink.businessId !== businessId ||
        existingLink.customerId !== item.customerId ||
        existingLink.normalizedPhone !== data.phone
    ) {
        fail(
            "არსებულ მომხმარებელთან კავშირი აღარ ემთხვევა დამტკიცებულ არჩევანს.",
            409,
        );
    }

    const existing = await tx.customer.findFirst({
        where: {
            id: item.customerId,
            businessId,
        },
        select: {
            id: true,
            phone: true,
            deletedAt: true,
            updatedAt: true,
        },
    });

    if (!existing || existing.deletedAt !== null) {
        fail(
            "არჩეული მომხმარებელი აღარ არსებობს ან წაშლილია. საჭიროა ხელახლა შემოწმება.",
            409,
        );
    }

    if (
        existing.updatedAt.toISOString() !==
        existingLink.updatedAt
    ) {
        fail(
            "არჩეული მომხმარებლის მონაცემები შეიცვალა. კავშირი ხელახლა დაადასტურე.",
            409,
        );
    }

    if (normalizeCustomerPhone(existing.phone) !== data.phone) {
        fail(
            "არჩეული მომხმარებლის ნომერი იმპორტის ჩანაწერს აღარ ემთხვევა.",
            409,
        );
    }

    // დაკავშირებისას არსებულ ველებს არ ვცვლით.
    return {
        action: "LINK",
        customerId: existing.id,
        phone: data.phone,
    };
}