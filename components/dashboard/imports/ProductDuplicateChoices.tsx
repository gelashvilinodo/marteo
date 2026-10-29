"use client";

import type {
    PreparedImportProduct,
} from "@/lib/imports/prepare-import-products";
import {
    getProductDuplicateGroups,
    getProductDuplicateGroupToken,
    type ProductDuplicateDecision,
} from "@/lib/imports/resolve-import-product-duplicates";

type Props = {
    records: readonly PreparedImportProduct[];
    decisions: readonly ProductDuplicateDecision[];
    onChange: (decisions: ProductDuplicateDecision[]) => void;
};

export default function ProductDuplicateChoices({
    records,
    decisions,
    onChange,
}: Props) {
    const groups = getProductDuplicateGroups(records);

    if (groups.length === 0) return null;

    function changeDecision(
        token: string,
        decision: ProductDuplicateDecision | null,
    ) {
        const remaining = decisions.filter(
            item => item.groupToken !== token,
        );

        onChange(decision ? [...remaining, decision] : remaining);
    }

    return (
        <section className="space-y-4">
            <h3 className="font-semibold">
                განმეორებული პროდუქტების გადაწყვეტა
            </h3>

            {groups.map(group => {
                const token = getProductDuplicateGroupToken(group);
                const matching = decisions.filter(
                    item => item.groupToken === token,
                );
                const decision =
                    matching.length === 1 ? matching[0] : null;

                return (
                    <div
                        key={token}
                        className="space-y-4 rounded-xl border border-danger/60 p-4"
                    >
                        <p className="text-sm text-text-secondary">
                            ეს ჩანაწერები ერთმანეთს ჰგავს. აირჩიე,
                            ერთი პროდუქტი განმეორდა თუ სხვადასხვა
                            პროდუქტია.
                        </p>

                        <div className="ml-2 space-y-3 border-l-2 border-danger/50 pl-4">
                            {group.map(record => {
                                const selected =
                                    decision?.action === "KEEP_ONE" &&
                                    decision.keepKey === record.key;

                                return (
                                    <article
                                        key={record.key}
                                        className="space-y-3 rounded-xl border border-danger/60 p-3 text-sm"
                                    >
                                        <p className="break-words font-semibold">
                                            {record.data?.name ??
                                                "უსახელო პროდუქტი"}
                                        </p>

                                        <p className="break-words text-text-secondary">
                                            {record.fileName}
                                            {" / "}
                                            {record.sheetName}
                                            {" - რიგი "}
                                            {record.rowNumber}
                                        </p>

                                        <p className="break-words">
                                            {[
                                                record.data?.brand,
                                                record.data?.color,
                                                record.data?.size,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ") ||
                                                "დამატებითი ნიშნები მითითებული არ არის"}
                                        </p>

                                        <p>
                                            გასაყიდი ფასი:{" "}
                                            {record.data?.salePrice ??
                                                "მითითებული არ არის"}
                                        </p>

                                        {record.mode === "CURRENT_STOCK" && (
                                            <>
                                                <p>
                                                    ნაშთი:{" "}
                                                    {record.data?.currentStock ??
                                                        "მითითებული არ არის"}
                                                </p>
                                                <p>
                                                    ერთეულის თვითღირებულება:{" "}
                                                    {record.data?.unitCost ??
                                                        "უცნობია"}
                                                </p>
                                            </>
                                        )}

                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() =>
                                                changeDecision(token, {
                                                    groupToken: token,
                                                    action: "KEEP_ONE",
                                                    keepKey: record.key,
                                                })
                                            }
                                            className="min-h-11 rounded-xl border border-border px-3"
                                        >
                                            {selected
                                                ? "არჩეულია - მხოლოდ ეს ჩანაწერი დარჩება"
                                                : "მხოლოდ ეს ჩანაწერი დავტოვოთ"}
                                        </button>
                                    </article>
                                );
                            })}
                        </div>

                        <p className="text-sm text-text-secondary">
                            ერთი ჩანაწერის დატოვებისას გამოიყენება
                            მხოლოდ მისი მონაცემები და ნაშთი.
                            რაოდენობები არ შეიკრიბება. დანარჩენი
                            ჩანაწერები საწყის ფაილში შენარჩუნდება.
                        </p>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                aria-pressed={
                                    decision?.action === "KEEP_SEPARATE"
                                }
                                onClick={() =>
                                    changeDecision(token, {
                                        groupToken: token,
                                        action: "KEEP_SEPARATE",
                                    })
                                }
                                className="min-h-11 rounded-xl border border-border px-3 text-sm"
                            >
                                {decision?.action === "KEEP_SEPARATE"
                                    ? "არჩეულია - სხვადასხვა პროდუქტებია"
                                    : "სხვადასხვა პროდუქტებია - ყველა დავტოვოთ"}
                            </button>

                            {decision && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        changeDecision(token, null)
                                    }
                                    className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                >
                                    არჩევანის გაუქმება
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}