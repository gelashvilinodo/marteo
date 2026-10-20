"use client";

import type {
    PreparedDraftOrder,
} from "@/lib/imports/prepare-draft-orders";

export default function OrderGroupingReview({
    orders,
    onConfirmationChange,
    onEditRow,
}: {
    orders: readonly PreparedDraftOrder[];
    onConfirmationChange: (
        token: string,
        confirmed: boolean,
    ) => void;
    onEditRow: (rowKey: string) => void;
}) {
    const candidates = orders.filter(
        order =>
            order.group.requiresConfirmation &&
            order.confirmationToken !== null &&
            order.result.kind === "PREVIEW_READY",
    );

    if (candidates.length === 0) return null;

    return (
        <section className="space-y-3">
            <h3 className="font-semibold">
                დაჯგუფების გადამოწმება
            </h3>

            <p className="text-sm text-text-secondary">
                ეს რიგები ერთნაირი ტელეფონისა და თარიღის მიხედვით
                გაერთიანდა. გადაამოწმე, ხომ არ არის ერთი ადამიანის
                იმავე დღეს გაკეთებული რამდენიმე სხვადასხვა შეკვეთა.
            </p>

            {candidates.map(order => {
                if (
                    order.result.kind !== "PREVIEW_READY" ||
                    order.confirmationToken === null
                ) {
                    return null;
                }

                const data = order.result.data;
                const token = order.confirmationToken;

                return (
                    <div
                        key={order.group.key}
                        className={[
                            "space-y-3 rounded-xl border p-3",
                            order.groupingConfirmed
                                ? "border-border"
                                : "border-danger/40",
                        ].join(" ")}
                    >
                        <p className="break-words text-sm font-semibold">
                            {order.fileName} /{" "}
                            {order.group.rows[0]?.sheetName}
                        </p>

                        <p className="text-sm text-text-secondary">
                            თარიღი: {data.date}.
                            {" "}ტელეფონი: {order.group.rows[0]?.phone}.
                            {" "}რიგები:{" "}
                            {order.group.rows
                                .map(row => row.rowNumber)
                                .join(", ")}.
                        </p>

                        <ul className="space-y-2 text-sm">
                            {data.lines.map(line => (
                                <li
                                    key={line.rowKey}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                >
                                    <span className="break-words">
                                        {line.data.name}
                                        {" "}× {line.data.quantity}
                                        {" "}— {line.data.lineTotal} ₾
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onEditRow(line.rowKey)}
                                        className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                    >
                                        რიგი {line.rowNumber} — შესწორება
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <p className="text-sm">
                            პროდუქტები: {data.totals.subtotal} ₾.
                            {" "}კურიერი: {data.totals.courierFee} ₾.
                            {" "}სულ: {data.totals.payableTotal} ₾.
                        </p>

                        <label className="flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={order.groupingConfirmed}
                                onChange={event =>
                                    onConfirmationChange(
                                        token,
                                        event.target.checked,
                                    )
                                }
                                className="mt-1 h-4 w-4"
                            />
                            <span>
                                ვადასტურებ, რომ ეს რიგები ერთი შეკვეთაა.
                            </span>
                        </label>

                        {!order.groupingConfirmed && (
                            <p className="text-xs text-text-secondary">
                                თუ სხვადასხვა შეკვეთებია, მიუთითე მათი
                                განსხვავებული შეკვეთის კოდები ან საერთო
                                არჩევანებში აირჩიე თითოეული რიგის ცალკე
                                შეკვეთად გადმოტანა.
                            </p>
                        )}
                    </div>
                );
            })}
        </section>
    );
}