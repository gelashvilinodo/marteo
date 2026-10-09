import {
    normalizeCustomerPhone,
    OrderValidationError,
} from "@/lib/orders/validate-order";

export function customerObject(
    value: unknown,
): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new OrderValidationError(
            "მომხმარებლის მონაცემების ფორმატი არასწორია.",
            422,
        );
    }

    return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
    if (value === undefined || value === null) return "";

    if (typeof value !== "string") {
        throw new OrderValidationError(
            `${label}: მონაცემის ფორმატი არასწორია.`,
            422,
        );
    }

    return value.normalize("NFC").trim();
}

export function validateCustomer(raw: unknown) {
    const data = customerObject(raw);
    const address = text(data.address, "მისამართი");

    if (!address) {
        throw new OrderValidationError(
            "მიუთითე მომხმარებლის მისამართი.",
            422,
        );
    }

    return {
        phone: normalizeCustomerPhone(
            text(data.phone, "ტელეფონი"),
        ),
        firstName: text(data.firstName, "სახელი") || null,
        lastName: text(data.lastName, "გვარი") || null,
        address,
    };
}