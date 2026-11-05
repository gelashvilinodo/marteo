import type {
    OrderImportOptions,
    OrderImportStatusChoice,
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
        reason: "CANCELED" | "RETURNED" | "EXCLUDED";
        message: string;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

export function normalizeOrderImportStatus(value: string): string {
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
    "confirmed",
    "accepted",
    "in progress",
    "დადასტურებული",
    "დადასტურებულია",
    "მიღებული",
    "მიღებულია",
    "შეკვეთილი",
    "მზადდება",
    "მომზადების პროცესში",
    "მოლოდინში",
]);

const shipped = new Set([
    "shipped",
    "dispatched",
    "გაგზავნილი",
    "გაგზავნილია",
    "in transit",
    "on the way",
    "out for delivery",
    "გზაში",
    "გზაშია",
    "კურიერთან",
    "კურიერს გადაეცა",
    "ტრანზიტში",
    "მიწოდების პროცესში",
]);

const completed = new Set([
    "completed",
    "complete",
    "დასრულებული",
    "დასრულებულია",
    "delivered",
    "done",
    "fulfilled",
    "მიწოდებული",
    "მიწოდებულია",
    "მიტანილი",
    "მიტანილია",
    "ჩაბარებული",
    "ჩაბარებულია",
    "გაყიდული",
    "შესრულებული",
    "შესრულებულია",
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

export function isKnownOrderImportStatus(value: string): boolean {
    const normalized = normalizeOrderImportStatus(value);

    return [processing, shipped, completed, canceled, returned]
        .some(values => values.has(normalized));
}

export function readOrderImportStatus(
    value: unknown,
    fallback: OrderImportOptions["missingStatus"],
    statusMap: Readonly<Record<string, OrderImportStatusChoice>> = {},
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
                "აირჩიეთ საერთო წესი სტატუსის გარეშე შეკვეთებისთვის " +
                "ან მიუთითეთ ამ შეკვეთის სტატუსი.",
        };
    }

    if (typeof value !== "string") {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "სტატუსის უჯრედში ტექსტური მნიშვნელობა არ არის. " +
                "აირჩიეთ სტატუსის შესაბამისი სვეტი ან შეასწორეთ მნიშვნელობა.",
        };
    }

    const normalized = normalizeOrderImportStatus(value);

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

    const chosen = Object.hasOwn(statusMap, normalized)
        ? statusMap[normalized]
        : undefined;

    if (chosen === "SKIP") {
        return {
            kind: "SKIPPED",
            reason: "EXCLUDED",
            message:
                `შეკვეთა გამოტოვებულია: სტატუსი „${value.trim()}“ ` +
                "მონიშნულია, როგორც გადმოსატანი არ არის.",
        };
    }

    if (chosen !== undefined) {
        return {
            kind: "READY",
            status: chosen,
            usedFallback: false,
        };
    }

    return {
        kind: "NEEDS_REVIEW",
        message:
            `სტატუსი „${value.trim()}“ ავტომატურად ვერ განვსაზღვრეთ. ` +
            "აირჩიეთ, რას ნიშნავს ეს სტატუსი, ზემოთ „ფაილის სტატუსები“ " +
            "ნაწილში. არჩევანი ამ სტატუსის მქონე ყველა შეკვეთას შეეხება.",
    };
}