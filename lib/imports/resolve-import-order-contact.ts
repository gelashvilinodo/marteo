import {
    resolveOrderGroupValue,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";

export type ImportedOrderContact = {
    phone: string | null;
    address: string | null;
    firstName: string | null;
    lastName: string | null;
    canCreateCustomer: boolean;
};

export type OrderContactResult =
    | {
        kind: "READY";
        data: ImportedOrderContact;
    }
    | {
        kind: "NEEDS_REVIEW";
        messages: string[];
    };

const fields = [
    "phone",
    "address",
    "firstName",
    "lastName",
] as const;

const labels = {
    phone: "ტელეფონი",
    address: "მისამართი",
    firstName: "მომხმარებლის სახელი",
    lastName: "მომხმარებლის გვარი",
};

function normalizePhone(text: string): string | null {
    if (!/^\+?[\d\s()-]+$/.test(text)) return null;

    let digits = text.replace(/\D/g, "");

    if (digits.startsWith("00")) digits = digits.slice(2);
    if (/^5\d{8}$/.test(digits)) digits = `995${digits}`;

    return /^[1-9]\d{7,14}$/.test(digits)
        ? `+${digits}`
        : null;
}

export function resolveImportOrderContact(
    rows: readonly PreparedOrderSourceRow[],
): OrderContactResult {
    const data: ImportedOrderContact = {
        phone: null,
        address: null,
        firstName: null,
        lastName: null,
        canCreateCustomer: false,
    };

    const messages: string[] = [];

    for (const field of fields) {
        const values: {
            rowNumber: number;
            value: string;
        }[] = [];

        for (const row of rows) {
            const sourceError = row.issues.find(
                issue =>
                    issue.severity === "ERROR" &&
                    issue.field === field,
            );

            if (sourceError) {
                messages.push(
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
                );
                continue;
            }

            const raw = row.input[field];

            if (
                raw === null ||
                raw === undefined ||
                (
                    typeof raw === "string" &&
                    !raw.trim()
                )
            ) {
                continue;
            }

            let text: string;

            if (typeof raw === "string") {
                text = raw
                    .normalize("NFC")
                    .replace(/\r\n?/g, "\n")
                    .trim();
            } else if (
                field === "phone" &&
                typeof raw === "number" &&
                Number.isSafeInteger(raw) &&
                raw > 0
            ) {
                text = String(raw);
            } else {
                messages.push(
                    `რიგი ${row.rowNumber}: ${labels[field]} — ` +
                    "მნიშვნელობის ფორმატი არასწორია. გადაამოწმე არჩეული სვეტი.",
                );
                continue;
            }

            if (field === "phone") {
                const phone = normalizePhone(text);

                if (phone === null) {
                    messages.push(
                        `რიგი ${row.rowNumber}: ტელეფონის ნომერი არასწორია. ` +
                        "შეასწორე ნომერი ან გაასუფთავე ეს ველი, თუ შეკვეთის " +
                        "მომხმარებელთან დაკავშირების გარეშე მიღება გინდა.",
                    );
                    continue;
                }

                text = phone;
            }

            values.push({
                rowNumber: row.rowNumber,
                value: text,
            });
        }

        const resolved = resolveOrderGroupValue({
            label: labels[field],
            values,
        });

        if (resolved.kind === "NEEDS_REVIEW") {
            const locations = resolved.conflicts.map(
                conflict =>
                    `${conflict.value} — რიგები ${conflict.rowNumbers.join(", ")}`,
            );

            messages.push(
                `${resolved.message} ${locations.join("; ")}.`,
            );
        } else if (resolved.kind === "READY") {
            data[field] = resolved.value;
        }
    }

    if (messages.length > 0) {
        return {
            kind: "NEEDS_REVIEW",
            messages: [...new Set(messages)],
        };
    }

    data.canCreateCustomer =
        data.phone !== null &&
        data.address !== null;

    return {
        kind: "READY",
        data,
    };
}