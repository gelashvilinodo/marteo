import "server-only";

import type {
    Prisma,
} from "@/generated/prisma/client";
import {
    checkExistingCustomers,
} from "./check-existing-customers";
import type {
    OrderCustomerCandidate,
} from "./prepare-order-customers";
import type {
    ImportCustomerCheckSnapshot,
    ImportExistingCustomerMatch,
} from "./import-types";

export async function checkOrderCustomers(input: {
    prisma: Pick<Prisma.TransactionClient, "$queryRaw">;
    businessId: string;
    candidates: readonly OrderCustomerCandidate[];
}) {
    const phones = [
        ...new Set(input.candidates.map(candidate => candidate.phone)),
    ].sort();

    const matches: ImportExistingCustomerMatch[] = [];
    const checkedPhones: string[] = [];
    const seenCustomerIds = new Set<string>();

    for (let offset = 0; offset < phones.length; offset += 500) {
        const batch = phones.slice(offset, offset + 500);

        const result = await checkExistingCustomers({
            prisma: input.prisma,
            businessId: input.businessId,
            phones: batch,
        });

        const returnedPhones = new Set(result.checkedPhones);

        if (
            result.businessId !== input.businessId ||
            result.checkedPhones.length !== batch.length ||
            returnedPhones.size !== batch.length ||
            batch.some(phone => !returnedPhones.has(phone))
        ) {
            throw new Error(
                "შეკვეთების მომხმარებლების შემოწმება სრულად ვერ დადასტურდა.",
            );
        }

        for (const match of result.matches) {
            if (
                !returnedPhones.has(match.normalizedPhone) ||
                seenCustomerIds.has(match.id)
            ) {
                throw new Error(
                    "მომხმარებლების შემოწმებამ შეუსაბამო ან განმეორებული ჩანაწერი დააბრუნა.",
                );
            }

            seenCustomerIds.add(match.id);
            matches.push(match);
        }

        checkedPhones.push(...result.checkedPhones);
    }

    const snapshot: ImportCustomerCheckSnapshot = {
        businessId: input.businessId,
        requestedPhones: phones,
        checkedPhones,
        failedPhones: [],
        matches,
        checkedAt: new Date().toISOString(),
    };

    const byPhone = new Map<string, ImportExistingCustomerMatch[]>();

    for (const match of matches) {
        const existing = byPhone.get(match.normalizedPhone) ?? [];
        existing.push(match);
        byPhone.set(match.normalizedPhone, existing);
    }

    const candidates = input.candidates.map(candidate => ({
        ...candidate,
        matches: byPhone.get(candidate.phone) ?? [],
    }));

    return {
        snapshot,
        candidates,
        newCandidateCount: candidates.filter(
            candidate => candidate.matches.length === 0,
        ).length,
        matchedCandidateCount: candidates.filter(
            candidate => candidate.matches.length > 0,
        ).length,
    };
}