"use client";

import {
    getProductPhotoDecisionToken,
    type ProductPhotoDecision,
} from "@/lib/imports/product-photo-decisions";

export default function ImportFilePhotoChoice({
    clientFileId,
    sha256,
    decisions,
    onChange,
}: {
    clientFileId: string;
    sha256: string;
    decisions: readonly ProductPhotoDecision[];
    onChange: (next: ProductPhotoDecision[]) => void;
}) {
    const token = getProductPhotoDecisionToken(
        { clientFileId, sha256 },
        { scope: "FILE" },
    );

    const saved = decisions.find(decision =>
        decision.clientFileId === clientFileId &&
        decision.scope === "FILE",
    );

    const checked =
        saved?.action === "SKIP_ALL" &&
        saved.token === token;

    return (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
            <label className="flex items-start gap-3 text-sm">
                <input
                    type="checkbox"
                    checked={checked}
                    className="mt-1 h-4 w-4"
                    onChange={event => {
                        const skipAll = event.target.checked;

                        const remaining = decisions.filter(
                            decision => {
                                if (
                                    decision.clientFileId !==
                                    clientFileId
                                ) {
                                    return true;
                                }

                                // საერთო გამოტოვების ჩართვისას
                                // ამ ფაილის რიგების არჩევანსაც ვასუფთავებთ.
                                return !skipAll &&
                                    decision.scope === "ROW";
                            },
                        );

                        onChange(
                            skipAll
                                ? [
                                    ...remaining,
                                    {
                                        clientFileId,
                                        token,
                                        scope: "FILE",
                                        action: "SKIP_ALL",
                                    },
                                ]
                                : remaining,
                        );
                    }}
                />

                <span>
                    ამ ფაილიდან ახალი პროდუქტები ფოტოების
                    გარეშე გადმოვიტანო
                </span>
            </label>

            <p className="text-xs text-text-secondary">
                პროდუქტები და მარაგები გადმოვა.
                ფოტოებს მოგვიანებით რედაქტირებიდან დაამატებ.
                არსებული პროდუქტების ფოტოები არ შეიცვლება.
            </p>

            {saved && saved.token !== token && (
                <p className="text-xs text-danger">
                    წინა არჩევანი ფაილის მიმდინარე ვერსიას
                    არ ემთხვევა. არჩევანი ხელახლა დაადასტურე.
                </p>
            )}
        </div>
    );
}