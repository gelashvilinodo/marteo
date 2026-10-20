import type {
    OrderCustomerCandidate,
} from "./prepare-order-customers";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export type OrderCustomerDecision =
    | {
        action: "SKIP";
        token: string;
    }
    | {
        action: "CREATE";
        token: string;
        variantKey: string;
    }
    | {
        action: "LINK";
        token: string;
        businessId: string;
        customerId: string;
        updatedAt: string;
    };

export type OrderCustomerDecisions =
    Record<string, OrderCustomerDecision>;

export function getOrderCustomerDecisionToken(
    candidate: OrderCustomerCandidate,
): string {
    return JSON.stringify([
        1,
        candidate.phone,
        [...new Set(candidate.orderKeys)].sort(),
        candidate.variants.map(variant => variant.key).sort(),
    ]);
}

export function validateOrderCustomerDecisions(
    value: unknown,
    businessId: string,
): OrderCustomerDecisions {
    if (value === undefined) return {};

    function fail(): never {
        throw new ImportDraftFileError(
            "შეკვეთების მომხმარებლებთან დაკავშირების არჩევანები არასწორია. მონაცემები არ შენახულა.",
        );
    }

    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        fail();
    }

    const input = value as Record<string, unknown>;
    const result: OrderCustomerDecisions = {};

    for (const [phone, raw] of Object.entries(input)) {
        if (
            !/^\+[1-9]\d{7,14}$/.test(phone) ||
            raw === null ||
            typeof raw !== "object" ||
            Array.isArray(raw)
        ) {
            fail();
        }

        const decision = raw as Record<string, unknown>;

        if (
            typeof decision.token !== "string" ||
            !decision.token
        ) {
            fail();
        }

        if (decision.action === "SKIP") {
            result[phone] = {
                action: "SKIP",
                token: decision.token,
            };
            continue;
        }

        if (decision.action === "CREATE") {
            if (
                typeof decision.variantKey !== "string" ||
                !decision.variantKey
            ) {
                fail();
            }

            result[phone] = {
                action: "CREATE",
                token: decision.token,
                variantKey: decision.variantKey,
            };
            continue;
        }

        if (decision.action === "LINK") {
            if (
                decision.businessId !== businessId ||
                typeof decision.customerId !== "string" ||
                !decision.customerId.trim() ||
                decision.customerId !== decision.customerId.trim() ||
                typeof decision.updatedAt !== "string" ||
                !Number.isFinite(Date.parse(decision.updatedAt))
            ) {
                fail();
            }

            result[phone] = {
                action: "LINK",
                token: decision.token,
                businessId,
                customerId: decision.customerId,
                updatedAt: decision.updatedAt,
            };
            continue;
        }

        fail();
    }

    return result;
}