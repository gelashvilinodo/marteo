import {
    getProductPhotoDecisionToken,
    type ProductPhotoDecision,
} from "./product-photo-decisions";

export type ResolvedProductPhotoDecision = {
    decision: ProductPhotoDecision | null;
    stale: boolean;
};

export function resolveProductPhotoDecision({
    decisions,
    clientFileId,
    sha256,
    sheetName,
    rowNumber,
}: {
    decisions: readonly ProductPhotoDecision[];
    clientFileId: string;
    sha256: string;
    sheetName: string;
    rowNumber: number;
}): ResolvedProductPhotoDecision {
    const fileDecisions = decisions.filter(decision =>
        decision.clientFileId === clientFileId &&
        decision.scope === "FILE",
    );

    const rowDecisions = decisions.filter(decision =>
        decision.clientFileId === clientFileId &&
        decision.scope === "ROW" &&
        decision.sheetName === sheetName &&
        decision.rowNumber === rowNumber,
    );

    if (
        fileDecisions.length > 1 ||
        rowDecisions.length > 1
    ) {
        throw new Error(
            "ერთ მდებარეობაზე ფოტოს რამდენიმე გადაწყვეტილებაა შენახული.",
        );
    }

    const fileDecision = fileDecisions[0];

    if (fileDecision) {
        const token = getProductPhotoDecisionToken(
            { clientFileId, sha256 },
            { scope: "FILE" },
        );

        if (fileDecision.token !== token) {
            return {
                decision: null,
                stale: true,
            };
        }

        // მთელი ფაილის ფოტოების გამოტოვება
        // ამ ფაილის ყველა რიგზე ვრცელდება.
        return {
            decision: fileDecision,
            stale: false,
        };
    }

    const rowDecision = rowDecisions[0];

    if (!rowDecision) {
        return {
            decision: null,
            stale: false,
        };
    }

    const token = getProductPhotoDecisionToken(
        { clientFileId, sha256 },
        {
            scope: "ROW",
            sheetName,
            rowNumber,
        },
    );

    if (rowDecision.token !== token) {
        return {
            decision: null,
            stale: true,
        };
    }

    return {
        decision: rowDecision,
        stale: false,
    };
}