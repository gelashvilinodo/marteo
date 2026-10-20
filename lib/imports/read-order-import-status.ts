import type {
    OrderImportOptions,
} from "./order-import-options";

export type ImportedOrderStatus =
    | "PROCESSING"
    | "SHIPPED"
    | "COMPLETED";

export type OrderStatusReadResult =
    | {
        kind: "READY";
        status: ImportedOrderStatus;
        usedFallback: boolean;
    }
    | {
        kind: "SKIPPED";
        reason: "CANCELED" | "RETURNED";
        message: string;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

function normalize(value: string): string {
    return value
        .normalize("NFC")
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

const processing = new Set([
    "processing",
    "pending",
    "new",
    "მუშავდება",
    "დამუშავებაში",
    "დამუშავების პროცესში",
    "ახალი",
]);

const shipped = new Set([
    "shipped",
    "dispatched",
    "გაგზავნილი",
    "გაგზავნილია",
]);

const completed = new Set([
    "completed",
    "complete",
    "დასრულებული",
    "დასრულებულია",
]);

const canceled = new Set([
    "canceled",
    "cancelled",
    "გაუქმებული",
    "გაუქმებულია",
]);

const returned = new Set([
    "returned",
    "return",
    "returning",
    "partially returned",
    "დაბრუნებული",
    "დაბრუნებულია",
    "დაბრუნება",
    "დაბრუნებაში",
    "ნაწილობრივ დაბრუნებული",
]);

export function readOrderImportStatus(
    value: unknown,
    fallback: OrderImportOptions["missingStatus"],
): OrderStatusReadResult {
    const missing =
        value === null ||
        value === undefined ||
        (
            typeof value === "string" &&
            value.trim() === ""
        );

    if (missing) {
        if (
            fallback === "PROCESSING" ||
            fallback === "COMPLETED"
        ) {
            return {
                kind: "READY",
                status: fallback,
                usedFallback: true,
            };
        }

        return {
            kind: "NEEDS_REVIEW",
            message:
                "შეკვეთის სტატუსი მითითებული არ არის. " +
                "აირჩიე საერთო წესი სტატუსის გარეშე შეკვეთებისთვის " +
                "ან მიუთითე ამ შეკვეთის სტატუსი.",
        };
    }

    if (typeof value !== "string") {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "სტატუსის უჯრედში ტექსტური მნიშვნელობა არ არის. " +
                "აირჩიე სტატუსის შესაბამისი სვეტი ან შეასწორე მნიშვნელობა.",
        };
    }

    const normalized = normalize(value);

    if (canceled.has(normalized)) {
        return {
            kind: "SKIPPED",
            reason: "CANCELED",
            message:
                "შეკვეთა გამოტოვებულია: გაუქმებული შეკვეთების " +
                "გადმოტანა ამ ეტაპზე მხარდაჭერილი არ არის.",
        };
    }

    if (returned.has(normalized)) {
        return {
            kind: "SKIPPED",
            reason: "RETURNED",
            message:
                "შეკვეთა გამოტოვებულია: დაბრუნებული ან დაბრუნებაში " +
                "მყოფი შეკვეთების გადმოტანა ამ ეტაპზე მხარდაჭერილი არ არის.",
        };
    }

    if (processing.has(normalized)) {
        return {
            kind: "READY",
            status: "PROCESSING",
            usedFallback: false,
        };
    }

    if (shipped.has(normalized)) {
        return {
            kind: "READY",
            status: "SHIPPED",
            usedFallback: false,
        };
    }

    if (completed.has(normalized)) {
        return {
            kind: "READY",
            status: "COMPLETED",
            usedFallback: false,
        };
    }

    return {
        kind: "NEEDS_REVIEW",
        message:
            `სტატუსი „${value.trim()}“ ავტომატურად ვერ განვსაზღვრეთ. ` +
            "მიუთითე შესაბამისი სტატუსი. საერთო წესი მხოლოდ ცარიელ " +
            "სტატუსებზე მოქმედებს და ამ მნიშვნელობას არ შეცვლის.",
    };
}