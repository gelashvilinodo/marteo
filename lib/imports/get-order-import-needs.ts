import { prepareDraftOrderRows, type OrderDraftFile } from "./prepare-draft-order-rows";
import { prepareOrderGrouping } from "./prepare-order-grouping";
import { createOrderImportOptions } from "./order-import-options";
import { readExplicitOrderPaymentStatus } from "./resolve-order-import-payment";
import { isKnownOrderImportStatus, normalizeOrderImportStatus } from "./read-order-import-status";
import type { ImportDraftSettings } from "./validate-import-draft-settings";

export type OrderImportUnknownStatus = { key: string; label: string; orders: number };
export type OrderImportNeeds = { status: boolean; payment: boolean; grouping: boolean; date: boolean; dateOrder: boolean; paymentDate: boolean; unknownStatuses: OrderImportUnknownStatus[] };
const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());

export function getOrderImportNeeds(files: readonly OrderDraftFile[], settings: ImportDraftSettings): OrderImportNeeds {
    const options = settings.orderOptions ?? createOrderImportOptions();
    const prepared = prepareDraftOrderRows({ files, settings });
    const grouped = prepareOrderGrouping({ rows: prepared.rows, options });
    const groups = grouped.groups.map(group => group.rows.flatMap(reference => {
        const row = grouped.sourceRows.get(reference.key);
        return row ? [row] : [];
    }));
    const ungrouped = new Set(grouped.problems.map(problem => problem.rowKey));
    groups.push(...prepared.rows.filter(row => ungrouped.has(row.key)).map(row => [row]));
    // ფაილის სტატუსები, რომლებსაც ვერ ვცნობთ: თითოეულს ერთხელ ვკითხულობთ.
    const unknown = new Map<string, { label: string; orders: Set<number> }>();
    groups.forEach((rows, index) => {
        for (const row of rows) {
            if (typeof row.input.status !== "string" || empty(row.input.status) || isKnownOrderImportStatus(row.input.status)) continue;
            const key = normalizeOrderImportStatus(row.input.status);
            const entry = unknown.get(key) ?? { label: row.input.status.trim(), orders: new Set<number>() };
            entry.orders.add(index);
            unknown.set(key, entry);
        }
    });
    return {
        unknownStatuses: [...unknown].map(([key, entry]) => ({ key, label: entry.label, orders: entry.orders.size })).sort((a, b) => b.orders - a.orders),
        status: groups.some(rows => rows.every(row => empty(row.input.status))),
        payment: groups.some(rows => rows.every(row => empty(row.input.paymentStatus) && empty(row.input.paidAmount))),
        grouping: prepared.rows.some(row => empty(row.input.orderCode)),
        date: groups.some(rows => rows.every(row => empty(row.input.date))),
        dateOrder: prepared.rows.some(row => [row.input.date, row.input.paymentDate].some(value => {
            if (typeof value !== "string") return false;
            const match = /^(\d{1,2})[/.](\d{1,2})[/.]\d{4}$/.exec(value.trim());
            return match !== null && Number(match[1]) <= 12 && Number(match[2]) <= 12;
        })),
        paymentDate: groups.some(rows => rows.every(row => empty(row.input.paymentDate)) && (
            rows.some(row => {
                const status = readExplicitOrderPaymentStatus(row.input.paymentStatus);
                return (status.kind === "READY" && status.status !== "UNPAID") ||
                    (!empty(row.input.paidAmount) && Number(String(row.input.paidAmount).replace(",", ".")) > 0);
            }) || (options.missingPayment === "PAID" && rows.every(row => empty(row.input.paymentStatus) && empty(row.input.paidAmount)))
        )),
    };
}
