import "server-only";

import type {
    Prisma,
} from "@/generated/prisma/client";

import {
    prepareDraftCustomers,
    type CustomerDraftFile,
} from "./prepare-draft-customers";

import {
    checkExistingCustomers,
} from "./check-existing-customers";

import {
    buildCustomerImportPlan,
} from "./build-customer-import-plan";

import type {
    ImportDraftSettings,
} from "./validate-import-draft-settings";

import type {
    ImportCustomerCheckSnapshot,
} from "./import-types";

// თუ რამდენიმე მოთხოვნისთვის ერთიანი სურათია საჭირო,
// გამომძახებელმა შესაბამისი ტრანზაქცია უნდა გამოიყენოს.
export async function checkDraftCustomers({
    prisma,
    businessId,
    files,
    settings,
}: {
    prisma: Pick<Prisma.TransactionClient, "$queryRaw">;
    businessId: string;
    files: readonly CustomerDraftFile[];
    settings: ImportDraftSettings;
}) {
    const prepared = prepareDraftCustomers({
        files,
        settings,
    });

    const phones = [
        ...new Set(
            prepared.records.flatMap(record =>
                record.status !== "INVALID" && record.data
                    ? [record.data.phone]
                    : [],
            ),
        ),
    ].sort();

    const matches: ImportCustomerCheckSnapshot["matches"] = [];
    const checkedPhones: string[] = [];

    for (let offset = 0; offset < phones.length; offset += 500) {
        const batch = phones.slice(offset, offset + 500);

        const checked = await checkExistingCustomers({
            prisma,
            businessId,
            phones: batch,
        });

        if (
            checked.businessId !== businessId ||
            checked.checkedPhones.length !== batch.length ||
            !batch.every(
                (phone, index) =>
                    phone === checked.checkedPhones[index],
            )
        ) {
            throw new Error(
                "Customer check result does not match the draft",
            );
        }

        checkedPhones.push(...checked.checkedPhones);
        matches.push(...checked.matches);
    }

    const snapshot: ImportCustomerCheckSnapshot = {
        businessId,
        requestedPhones: phones,
        checkedPhones,
        failedPhones: [],
        matches,
        checkedAt: new Date().toISOString(),
    };

    const plan = buildCustomerImportPlan({
        records: prepared.records,
        snapshot,
        links: settings.existingCustomerLinks,
    });

    return {
        prepared,
        snapshot,
        plan,
    };
}