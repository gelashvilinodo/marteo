import { Prisma } from "@/generated/prisma/client";

export class OrderValidationError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "OrderValidationError";
    }
}

export type OrderProduct = {
    orderItemId?: string;
    source: "INVENTORY" | "MANUAL";
    inventoryItemId: string | null;
    condition: "GOOD" | "DEFECTIVE";
    name: string;
    imageUrl: string | null;
    description: string;
    color: string;
    size: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    unitCost: Prisma.Decimal | null;
};

export type ValidatedOrder = {
    clientRequestId: string;
    recipientPhone: string;
    recipientFirstName: string;
    recipientLastName: string;
    shippingAddress: string;
    status: "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELED";
    courierFee: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD";
    bankName: string;
    items: OrderProduct[];
};

function fail(message: string): never {
    throw new OrderValidationError(message);
}

function object(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail("შეკვეთის მონაცემების ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
    if (value === undefined || value === null) return "";

    if (typeof value !== "string") {
        fail(`${label}: მონაცემის ფორმატი არასწორია.`);
    }

    return value.normalize("NFC").trim();
}

export function normalizeCustomerPhone(value: string): string {
    const trimmed = value.trim();

    if (!/^\+?[\d\s()-]+$/.test(trimmed)) {
        fail("ტელეფონის ნომერი არასწორია.");
    }

    let digits = trimmed.replace(/\D/g, "");

    if (digits.startsWith("00")) {
        digits = digits.slice(2);
    }

    // ადგილობრივად ჩაწერილი ქართული ნომერი.
    if (/^5\d{8}$/.test(digits)) {
        digits = `995${digits}`;
    }

    if (!/^[1-9]\d{7,14}$/.test(digits)) {
        fail("მიუთითე სწორი ტელეფონის ნომერი.");
    }

    return `+${digits}`;
}

function money(
    value: unknown,
    label: string,
): Prisma.Decimal {
    if (typeof value !== "string") {
        fail(`${label}: მიუთითე თანხა.`);
    }

    const normalized = value.trim().replace(",", ".");

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        fail(`${label}: მიუთითე თანხა მაქსიმუმ ორი ათწილადით.`);
    }

    const amount = new Prisma.Decimal(normalized);

    // ბაზაში თანხის ველი Decimal(12, 2)-ია.
    if (amount.greaterThan("9999999999.99")) {
        fail(`${label}: თანხა დასაშვებ ზღვარს აღემატება.`);
    }

    return amount;
}

export function validateOrder(raw: unknown, mode: "create" | "edit" = "create"): ValidatedOrder {
    const data = object(raw);

    const clientRequestId = text(
        data.clientRequestId,
        "მოთხოვნის კოდი",
    );

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            clientRequestId,
        )
    ) {
        fail("შეკვეთის მოთხოვნის კოდი არასწორია.");
    }

    if (
        data.status !== "PROCESSING" &&
        data.status !== "COMPLETED" &&
        !(mode === "edit" && (data.status === "SHIPPED" || data.status === "CANCELED"))
    ) {
        fail("შეკვეთის სტატუსი არასწორია.");
    }

    if (mode === "create" && data.status === "COMPLETED" && data.confirmCompleted !== true) {
        fail("დაადასტურე დასრულება: ამის შემდეგ შეკვეთა აღარ რედაქტირდება.");
    }

    if (
        data.paymentMethod !== "CASH" &&
        data.paymentMethod !== "BANK_TRANSFER" &&
        data.paymentMethod !== "CARD"
    ) {
        fail("გადახდის მეთოდი არასწორია.");
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
        fail("შეკვეთაში დაამატე მინიმუმ ერთი პროდუქტი.");
    }

    const items: OrderProduct[] = data.items.map(
        (entry, index) => {
            const item = object(entry);
            const label = `პროდუქტი ${index + 1}`;

            if (
                item.source !== "INVENTORY" &&
                item.source !== "MANUAL"
            ) {
                fail(`${label}: პროდუქტის წყარო არასწორია.`);
            }

            if (
                item.condition !== "GOOD" &&
                item.condition !== "DEFECTIVE"
            ) {
                fail(`${label}: პროდუქტის მდგომარეობა არასწორია.`);
            }

            if (
                typeof item.quantity !== "number" ||
                !Number.isInteger(item.quantity) ||
                item.quantity < 1 ||
                item.quantity > 2147483647
            ) {
                fail(`${label}: რაოდენობა უნდა იყოს დადებითი მთელი რიცხვი.`);
            }

            const name = text(item.name, `${label}, სახელი`);

            if (!name) {
                fail(`${label}: მიუთითე სახელი.`);
            }

            const inventoryItemId =
                item.source === "INVENTORY"
                    ? text(item.inventoryItemId, label)
                    : null;

            if (item.source === "INVENTORY" && !inventoryItemId) {
                fail(`${label}: აირჩიე პროდუქტი მარაგიდან.`);
            }

            return {
                orderItemId:
                    mode === "edit"
                        ? text(item.orderItemId, `${label}, ჩანაწერის კოდი`) || undefined
                        : undefined,
                source: item.source,
                inventoryItemId,
                condition: item.condition,
                name,
                imageUrl:
                    item.source === "MANUAL"
                        ? text(item.imageUrl, `${label}, ფოტო`) || null
                        : null,
                description: text(item.description, label),
                color: text(item.color, label),
                size: text(item.size, label),
                quantity: item.quantity,
                unitPrice: money(
                    item.unitPrice,
                    `${label}, გასაყიდი ფასი`,
                ),
                // მარაგის თვითღირებულებას სერვერი პარტიებიდან აიღებს.
                unitCost:
                    item.source === "MANUAL"
                        ? money(
                            item.unitCost,
                            `${label}, თვითღირებულება`,
                        )
                        : null,
            };
        },
    );

    const courierFee = money(
        data.courierFee,
        "კურიერის საფასური",
    );

    const paidAmount = money(
        data.paidAmount,
        "გადახდილი თანხა",
    );

    const total = items.reduce(
        (sum, item) =>
            sum.plus(item.unitPrice.mul(item.quantity)),
        courierFee,
    );

    if (mode === "create" && paidAmount.greaterThan(total)) {
        fail("გადახდილი თანხა შეკვეთის ჯამს აღემატება.");
    }

    return {
        clientRequestId: clientRequestId.toLowerCase(),
        recipientPhone: normalizeCustomerPhone(
            text(data.recipientPhone, "ტელეფონი"),
        ),
        recipientFirstName: text(
            data.recipientFirstName,
            "სახელი",
        ),
        recipientLastName: text(
            data.recipientLastName,
            "გვარი",
        ),
        shippingAddress: text(
            data.shippingAddress,
            "მისამართი",
        ),
        status: data.status,
        courierFee,
        paidAmount,
        paymentMethod: data.paymentMethod,
        bankName:
            data.paymentMethod === "BANK_TRANSFER"
                ? text(data.bankName, "ბანკი")
                : "",
        items,
    };
}