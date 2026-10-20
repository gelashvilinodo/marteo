import type {
    PreparedDraftOrder,
} from "./prepare-draft-orders";
import type {
    ImportedCustomer,
} from "./import-types";
import {
    validateImportCustomer,
} from "./validate-import-customer";

export type OrderCustomerVariant = {
    key: string;
    data: ImportedCustomer;
    orderKeys: string[];
};

export type OrderCustomerCandidate = {
    phone: string;
    orderKeys: string[];
    variants: OrderCustomerVariant[];
};

export function prepareOrderCustomers(
    orders: readonly PreparedDraftOrder[],
): {
    candidates: OrderCustomerCandidate[];
    withoutCustomerData: string[];
} {
    const candidates = new Map<string, {
        phone: string;
        orderKeys: Set<string>;
        variants: Map<string, {
            data: ImportedCustomer;
            orderKeys: Set<string>;
        }>;
    }>();

    const withoutCustomerData: string[] = [];

    for (const order of orders) {
        if (order.result.kind !== "PREVIEW_READY") continue;

        const contact = order.result.data.contact;

        if (
            contact.phone === null ||
            contact.address === null
        ) {
            withoutCustomerData.push(order.group.key);
            continue;
        }

        const validated = validateImportCustomer({
            phone: contact.phone,
            address: contact.address,
            firstName: contact.firstName,
            lastName: contact.lastName,
        });

        if (!validated.valid) {
            throw new Error(
                "შეკვეთის შემოწმებული საკონტაქტო მონაცემები მომხმარებლის წესებს არ შეესაბამება.",
            );
        }

        const data = validated.data;

        const variantKey = JSON.stringify([
            data.phone,
            data.address,
            data.firstName,
            data.lastName,
        ]);

        let candidate = candidates.get(data.phone);

        if (!candidate) {
            candidate = {
                phone: data.phone,
                orderKeys: new Set(),
                variants: new Map(),
            };
            candidates.set(data.phone, candidate);
        }

        candidate.orderKeys.add(order.group.key);

        let variant = candidate.variants.get(variantKey);

        if (!variant) {
            variant = {
                data,
                orderKeys: new Set(),
            };
            candidate.variants.set(variantKey, variant);
        }

        variant.orderKeys.add(order.group.key);
    }

    return {
        candidates: [...candidates.values()].map(candidate => ({
            phone: candidate.phone,
            orderKeys: [...candidate.orderKeys],
            variants: [...candidate.variants.entries()].map(
                ([key, variant]) => ({
                    key,
                    data: variant.data,
                    orderKeys: [...variant.orderKeys],
                }),
            ),
        })),
        withoutCustomerData,
    };
}