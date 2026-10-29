"use client";

import type {
    OrderCustomerCandidate,
} from "@/lib/imports/prepare-order-customers";
import type {
    ImportExistingCustomerMatch,
} from "@/lib/imports/import-types";
import {
    getOrderCustomerDecisionToken,
    type OrderCustomerDecision,
    type OrderCustomerDecisions,
} from "@/lib/imports/order-customer-decisions";

export default function OrderCustomerChoices({
    businessId,
    candidates,
    decisions,
    onChange,
}: {
    businessId: string;
    candidates: readonly (
        OrderCustomerCandidate & {
            matches: ImportExistingCustomerMatch[];
        }
    )[];
    decisions: OrderCustomerDecisions;
    onChange: (
        phone: string,
        decision: OrderCustomerDecision | null,
    ) => void;
}) {
    if (candidates.length === 0) return null;

    const noMatches = candidates.filter(
        candidate => candidate.matches.length === 0,
    ).length;

    const visible = candidates.filter(
        candidate =>
            candidate.matches.length > 0 ||
            candidate.variants.length > 1 ||
            decisions[candidate.phone] !== undefined,
    );

    const button =
        "min-h-11 rounded-xl border border-border px-3 text-sm";

    return (
        <section className="space-y-3">
            <h3 className="text-sm font-semibold">
                შეკვეთების მომხმარებლებთან დაკავშირება
            </h3>

            {noMatches > 0 && (
                <p className="text-sm text-text-secondary">
                    დამთხვევა ვერ მოიძებნა {noMatches} ნომერზე.
                    ერთი სრული ვარიანტის შემთხვევაში ახალი მომხმარებელი
                    შეკვეთებთან ერთად შეიქმნება.
                </p>
            )}

            {visible.map(candidate => {
                const token = getOrderCustomerDecisionToken(candidate);
                const saved = decisions[candidate.phone];
                const decision = saved?.token === token ? saved : null;

                return (
                    <div
                        key={candidate.phone}
                        className="space-y-3 rounded-xl border border-border p-3"
                    >
                        <p className="text-sm font-semibold">
                            {candidate.phone}
                            {" "}- {candidate.orderKeys.length} შეკვეთა
                        </p>

                        {saved && !decision && (
                            <p className="text-sm text-danger">
                                წყაროს მონაცემები შეიცვალა.
                                არჩევანი ხელახლა გააკეთე.
                            </p>
                        )}

                        {candidate.matches.map(match => {
                            const selected =
                                decision?.action === "LINK" &&
                                decision.customerId === match.id &&
                                decision.updatedAt === match.updatedAt;

                            return (
                                <div
                                    key={match.id}
                                    className="space-y-2 rounded-xl border border-border p-3"
                                >
                                    <p className="text-sm">
                                        {[match.firstName, match.lastName]
                                            .filter(Boolean)
                                            .join(" ") || match.phone}
                                    </p>

                                    {match.address && (
                                        <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">
                                            {match.address}
                                        </p>
                                    )}

                                    {match.deletedAt !== null ? (
                                        <p className="text-sm text-danger">
                                            მომხმარებელი წაშლილია.
                                            ავტომატურად არ აღვადგენთ.
                                            შეგიძლია შეკვეთები კავშირის
                                            გარეშე გადმოიტანო.
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => onChange(
                                                candidate.phone,
                                                {
                                                    action: "LINK",
                                                    token,
                                                    businessId,
                                                    customerId: match.id,
                                                    updatedAt: match.updatedAt,
                                                },
                                            )}
                                            className={button}
                                        >
                                            {selected
                                                ? "ეს მომხმარებელი არჩეულია"
                                                : "ამ მომხმარებელთან დაკავშირება"}
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {candidate.matches.length === 0 &&
                            candidate.variants.map(variant => {
                                const selected =
                                    decision?.action === "CREATE" &&
                                    decision.variantKey === variant.key;

                                return (
                                    <div
                                        key={variant.key}
                                        className="space-y-2 rounded-xl border border-border p-3"
                                    >
                                        <p className="text-sm">
                                            {[
                                                variant.data.firstName,
                                                variant.data.lastName,
                                            ].filter(Boolean).join(" ") ||
                                                candidate.phone}
                                        </p>
                                        <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">
                                            {variant.data.address}
                                        </p>
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => onChange(
                                                candidate.phone,
                                                {
                                                    action: "CREATE",
                                                    token,
                                                    variantKey: variant.key,
                                                },
                                            )}
                                            className={button}
                                        >
                                            {selected
                                                ? "ეს მონაცემები არჩეულია"
                                                : "ახალი მომხმარებლისთვის არჩევა"}
                                        </button>
                                    </div>
                                );
                            })}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                aria-pressed={decision?.action === "SKIP"}
                                onClick={() => onChange(
                                    candidate.phone,
                                    { action: "SKIP", token },
                                )}
                                className={button}
                            >
                                {decision?.action === "SKIP"
                                    ? "კავშირი გამოტოვებულია"
                                    : "მომხმარებელთან კავშირის გარეშე"}
                            </button>

                            {saved && (
                                <button
                                    type="button"
                                    onClick={() => onChange(
                                        candidate.phone,
                                        null,
                                    )}
                                    className={button}
                                >
                                    არჩევანის გაუქმება
                                </button>
                            )}
                        </div>

                        <p className="text-xs text-text-secondary">
                            არსებული მომხმარებლის მონაცემები არ შეიცვლება.
                            შეკვეთებზე მათი მიმღების ინფორმაცია დარჩება.
                        </p>
                    </div>
                );
            })}
        </section>
    );
}