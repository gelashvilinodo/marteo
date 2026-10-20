import { getOrderCustomerDecisionToken, type OrderCustomerDecisions } from "./order-customer-decisions";
import type { OrderCustomerCandidate } from "./prepare-order-customers";
import type { ImportExistingCustomerMatch } from "./import-types";

function object(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Reuse only customers already explicitly created/linked by this same import.
// Ordinary existing customers still require the usual explicit decision.
export function linkOrderCustomersFromImport(input: {
    businessId: string;
    skipCustomers?: boolean;
    candidates: readonly (OrderCustomerCandidate & { matches: ImportExistingCustomerMatch[] })[];
    decisions: OrderCustomerDecisions;
    imported: readonly { normalizedData: unknown; result: unknown }[];
}): OrderCustomerDecisions {
    if (input.skipCustomers) {
        return Object.fromEntries(input.candidates.map(candidate => [candidate.phone, {
            action: "SKIP" as const, token: getOrderCustomerDecisionToken(candidate),
        }]));
    }
    const approved = new Map<string, Set<string>>();
    for (const record of input.imported) {
        const data = object(record.normalizedData);
        const result = object(record.result);
        if (typeof data?.phone !== "string" || typeof result?.customerId !== "string" ||
            (result.action !== "CREATE" && result.action !== "LINK")) continue;
        const ids = approved.get(data.phone) ?? new Set<string>();
        ids.add(result.customerId);
        approved.set(data.phone, ids);
    }
    const decisions = { ...input.decisions };
    for (const candidate of input.candidates) {
        const token = getOrderCustomerDecisionToken(candidate);
        const previous = decisions[candidate.phone];
        if (previous && (previous.token !== token || previous.action !== "CREATE")) continue;
        const matches = candidate.matches.filter(match => match.deletedAt === null && approved.get(candidate.phone)?.has(match.id));
        if (matches.length !== 1) continue;
        decisions[candidate.phone] = { action: "LINK", token, businessId: input.businessId,
            customerId: matches[0].id, updatedAt: matches[0].updatedAt };
    }
    return decisions;
}
