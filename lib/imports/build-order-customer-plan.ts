import type {
    OrderCustomerCandidate,
} from "./prepare-order-customers";
import type {
    ImportedCustomer,
    ImportExistingCustomerMatch,
} from "./import-types";
import {
    getOrderCustomerDecisionToken,
    type OrderCustomerDecisions,
} from "./order-customer-decisions";

export type OrderCustomerPlanItem = {
    phone: string;
    orderKeys: string[];
    action: "CREATE" | "LINK" | "SKIP" | "BLOCKED";
    data: ImportedCustomer | null;
    customerId: string | null;
    customerUpdatedAt: string | null;
    reason: string | null;
};

export function buildOrderCustomerPlan(input: {
    businessId: string;
    candidates: readonly (
        OrderCustomerCandidate & {
            matches: ImportExistingCustomerMatch[];
        }
    )[];
    decisions: OrderCustomerDecisions;
}) {
    const items: OrderCustomerPlanItem[] = [];
    const seen = new Set<string>();

    for (const candidate of input.candidates) {
        if (seen.has(candidate.phone)) {
            throw new Error(
                "მომხმარებლის გეგმაში ერთი ტელეფონი მეორდება.",
            );
        }

        seen.add(candidate.phone);

        const token = getOrderCustomerDecisionToken(candidate);
        const decision = input.decisions[candidate.phone];

        const base = {
            phone: candidate.phone,
            orderKeys: candidate.orderKeys,
            data: null,
            customerId: null,
            customerUpdatedAt: null,
        };

        function blocked(reason: string) {
            items.push({
                ...base,
                action: "BLOCKED",
                reason,
            });
        }

        if (decision && decision.token !== token) {
            blocked(
                "ამ ნომრის იმპორტის მონაცემები შეიცვალა. მომხმარებელთან დაკავშირების არჩევანი ხელახლა გააკეთე.",
            );
            continue;
        }

        if (decision?.action === "SKIP") {
            items.push({
                ...base,
                action: "SKIP",
                reason: null,
            });
            continue;
        }

        if (decision?.action === "LINK") {
            const match = candidate.matches.find(
                item => item.id === decision.customerId,
            );

            if (
                decision.businessId !== input.businessId ||
                !match ||
                match.normalizedPhone !== candidate.phone ||
                match.deletedAt !== null ||
                match.updatedAt !== decision.updatedAt
            ) {
                blocked(
                    "არჩეული მომხმარებელი შეიცვალა, წაშლილია ან ამ ნომერს აღარ შეესაბამება. ხელახლა შეამოწმე დამთხვევა ან გამოტოვე მომხმარებელთან კავშირი.",
                );
                continue;
            }

            items.push({
                ...base,
                action: "LINK",
                customerId: match.id,
                customerUpdatedAt: match.updatedAt,
                reason: null,
            });
            continue;
        }

        if (candidate.matches.length > 0) {
            blocked(
                "ამ ნომრით მომხმარებელი უკვე არსებობს. აირჩიე შესაბამისი მომხმარებელი ან შეკვეთები მომხმარებელთან კავშირის გარეშე გადმოიტანე.",
            );
            continue;
        }

        const variant = decision?.action === "CREATE"
            ? candidate.variants.find(
                item => item.key === decision.variantKey,
            )
            : candidate.variants.length === 1
              ? candidate.variants[0]
              : null;

        if (!variant) {
            blocked(
                "ამ ნომრისთვის მომხმარებლის მონაცემების რამდენიმე ვარიანტია ან ძველი არჩევანი აღარ არსებობს. ერთხელ აირჩიე პროფილის მონაცემები ან გამოტოვე მომხმარებელთან კავშირი.",
            );
            continue;
        }

        items.push({
            ...base,
            action: "CREATE",
            data: variant.data,
            reason: null,
        });
    }

    return {
        items,
        createCount: items.filter(
            item => item.action === "CREATE",
        ).length,
        linkCount: items.filter(
            item => item.action === "LINK",
        ).length,
        skipCount: items.filter(
            item => item.action === "SKIP",
        ).length,
        blockedCount: items.filter(
            item => item.action === "BLOCKED",
        ).length,
    };
}