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

type CheckedImportCustomer =
    | {
        action: "CREATE";
        item: CustomerImportPlanItem;
        data: {
            phone: string;
            address: string;
            firstName: string | null;
            lastName: string | null;
        };
    }
    | {
        action: "LINK";
        item: CustomerImportPlanItem;
        phone: string;
        link: ImportExistingCustomerLink;
    };

function failFor(
    item: CustomerImportPlanItem,
    message: string,
    status = 422,
): never {
    const record = item.record;

    throw new OrderValidationError(
        `${record.fileName} / ${record.sheetName} - რიგი ${record.rowNumber}: ${message}`,
        status,
    );
}

function checkImportedCustomer(
    businessId: string,
    item: CustomerImportPlanItem,
    existingLink: ImportExistingCustomerLink | null,
): CheckedImportCustomer {
    const record = item.record;
    function fail(message: string, status?: number): never {
        failFor(item, message, status);
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

        return {
            action: "CREATE",
            item,
            data: {
                phone: data.phone,
                address: data.address,
                firstName: data.firstName,
                lastName: data.lastName,
            },
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

    return {
        action: "LINK",
        item,
        phone: data.phone,
        link: existingLink,
    };
}

// გამოიძახე მხოლოდ ავტორიზებულ ტრანზაქციაში:
// ბიზნესი დაბლოკილი და იმპორტის გეგმა ხელახლა შემოწმებული უნდა იყოს.
// ჯერ ყველა ჩანაწერს ვამოწმებთ, შემდეგ ბაზაში რამდენიმე
// ჯგუფურ მოთხოვნად ვწერთ, რომ დიდი ფაილი ტაიმაუტზე არ გავიდეს.
export async function applyImportedCustomers({
    tx,
    businessId,
    items,
    existingLinks,
}: {
    tx: Prisma.TransactionClient;
    businessId: string;
    items: readonly CustomerImportPlanItem[];
    existingLinks: Readonly<
        Record<string, ImportExistingCustomerLink | null>
    >;
}): Promise<AppliedImportCustomer[]> {
    const checked = items.map(item => {
        const phone = item.record.data?.phone;

        return checkImportedCustomer(
            businessId,
            item,
            phone ? existingLinks[phone] ?? null : null,
        );
    });

    const linkIds = [...new Set(checked.flatMap(entry =>
        entry.action === "LINK" ? [entry.link.customerId] : [],
    ))];

    const existing = linkIds.length === 0
        ? []
        : await tx.customer.findMany({
            where: {
                id: { in: linkIds },
                businessId,
            },
            select: {
                id: true,
                phone: true,
                deletedAt: true,
                updatedAt: true,
            },
        });

    const existingById = new Map(
        existing.map(customer => [customer.id, customer]),
    );

    for (const entry of checked) {
        if (entry.action !== "LINK") continue;

        const customer = existingById.get(entry.link.customerId);

        if (!customer || customer.deletedAt !== null) {
            failFor(
                entry.item,
                "არჩეული მომხმარებელი აღარ არსებობს ან წაშლილია. საჭიროა ხელახლა შემოწმება.",
                409,
            );
        }

        if (
            customer.updatedAt.toISOString() !==
            entry.link.updatedAt
        ) {
            failFor(
                entry.item,
                "არჩეული მომხმარებლის მონაცემები შეიცვალა. კავშირი ხელახლა დაადასტურეთ.",
                409,
            );
        }

        if (normalizeCustomerPhone(customer.phone) !== entry.phone) {
            failFor(
                entry.item,
                "არჩეული მომხმარებლის ნომერი იმპორტის ჩანაწერს აღარ ემთხვევა.",
                409,
            );
        }
    }

    const creates = checked.flatMap(entry =>
        entry.action === "CREATE" ? [entry.data] : [],
    );

    const createdByPhone = new Map<string, string>();

    for (let index = 0; index < creates.length; index += 500) {
        const created = await tx.customer.createManyAndReturn({
            data: creates.slice(index, index + 500).map(data => ({
                businessId,
                ...data,
            })),
            select: {
                id: true,
                phone: true,
            },
        });

        for (const customer of created) {
            createdByPhone.set(customer.phone, customer.id);
        }
    }

    // დაკავშირებისას არსებულ ველებს არ ვცვლით.
    return checked.map(entry => {
        if (entry.action === "LINK") {
            return {
                action: "LINK",
                customerId: entry.link.customerId,
                phone: entry.phone,
            };
        }

        const customerId = createdByPhone.get(entry.data.phone);

        if (!customerId) {
            throw new Error("Created import customer is missing");
        }

        return {
            action: "CREATE",
            customerId,
            phone: entry.data.phone,
        };
    });
}
