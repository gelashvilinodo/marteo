import {
    validateImportDraftSettings,
    type ImportDraftSettings,
} from "./validate-import-draft-settings";

function stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => {
        if (
            item === null ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            return item;
        }

        const source = item as Record<string, unknown>;

        return Object.fromEntries(
            Object.keys(source)
                .sort()
                .map(key => [key, source[key]]),
        );
    });
}

export function validatePartialOrderCustomerSettings({
    savedSettings,
    nextSettings,
    ordersCompleted,
    businessId,
}: {
    savedSettings: unknown;
    nextSettings: unknown;
    ordersCompleted: boolean;
    businessId: string;
}): ImportDraftSettings {
    if (ordersCompleted) {
        throw new Error(
            "შეკვეთები უკვე გადმოტანილია. ამ მონახაზში მათი " +
            "მომხმარებელთან დაკავშირების არჩევანს ვეღარ შეცვლი.",
        );
    }

    const saved = validateImportDraftSettings(
        savedSettings,
        businessId,
    );

    const next = validateImportDraftSettings(
        nextSettings,
        businessId,
    );

    const savedOtherSettings = {
        ...saved,
        orderCustomerDecisions: undefined,
    };

    const nextOtherSettings = {
        ...next,
        orderCustomerDecisions: undefined,
    };

    if (
        stableJson(savedOtherSettings) !==
        stableJson(nextOtherSettings)
    ) {
        throw new Error(
            "ნაწილობრივ დასრულებულ მონახაზში ამ მოქმედებით " +
            "შეგიძლია შეცვალო მხოლოდ შეკვეთების მომხმარებლებთან " +
            "დაკავშირების არჩევანი. სხვა პარამეტრები უცვლელი უნდა დარჩეს.",
        );
    }

    return {
        ...saved,
        orderCustomerDecisions: next.orderCustomerDecisions ?? {},
    };
}