import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

type DecisionBase = {
    clientFileId: string;
    token: string;
};

type RowLocation = {
    scope: "ROW";
    sheetName: string;
    rowNumber: number;
};

export type ProductPhotoDecision =
    | (
        DecisionBase & {
            scope: "FILE";
            action: "SKIP_ALL";
        }
    )
    | (
        DecisionBase &
        RowLocation & {
            action: "SKIP";
        }
    )
    | (
        DecisionBase &
        RowLocation & {
            action: "USE";
            sourcePath: string;
            columnNumber: number;
        }
    );

export function getProductPhotoDecisionToken(
    source: {
        clientFileId: string;
        sha256: string;
    },
    location:
        | { scope: "FILE" }
        | RowLocation,
): string {
    return JSON.stringify([
        1,
        source.clientFileId,
        source.sha256,
        location.scope,
        location.scope === "ROW"
            ? location.sheetName
            : null,
        location.scope === "ROW"
            ? location.rowNumber
            : null,
    ]);
}

export function getProductPhotoDecisionKey(
    decision: ProductPhotoDecision,
): string {
    return JSON.stringify([
        decision.clientFileId,
        decision.scope,
        decision.scope === "ROW"
            ? decision.sheetName
            : null,
        decision.scope === "ROW"
            ? decision.rowNumber
            : null,
    ]);
}

function fail(message: string): never {
    throw new ImportDraftFileError(
        `ფოტოების არჩევანი: ${message}`,
    );
}

function text(
    value: unknown,
    maxLength: number,
): string {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > maxLength ||
        /[\u0000-\u001f]/.test(value)
    ) {
        fail("მნიშვნელობა აკლია ან არასწორია.");
    }

    return value;
}

function positiveInteger(
    value: unknown,
    maximum: number,
): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > maximum
    ) {
        fail("რიგის ან სვეტის ნომერი არასწორია.");
    }

    return value;
}

export function validateProductPhotoDecisions(
    raw: unknown,
): ProductPhotoDecision[] {
    if (raw === undefined) return [];

    if (!Array.isArray(raw) || raw.length > 10_000) {
        fail("სია არასწორია ან ძალიან დიდია.");
    }

    const keys = new Set<string>();

    return raw.map(value => {
        if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            fail("ჩანაწერის ფორმატი არასწორია.");
        }

        const item = value as Record<string, unknown>;

        const clientFileId = text(item.clientFileId, 36);

        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                clientFileId,
            )
        ) {
            fail("წყაროს ფაილის კოდი არასწორია.");
        }

        const base = {
            clientFileId: clientFileId.toLowerCase(),
            token: text(item.token, 4096),
        };

        let decision: ProductPhotoDecision;

        if (
            item.scope === "FILE" &&
            item.action === "SKIP_ALL"
        ) {
            decision = {
                ...base,
                scope: "FILE",
                action: "SKIP_ALL",
            };
        } else if (item.scope === "ROW") {
            const location: RowLocation = {
                scope: "ROW",
                sheetName: text(item.sheetName, 500),
                rowNumber: positiveInteger(
                    item.rowNumber,
                    1_048_576,
                ),
            };

            if (item.action === "SKIP") {
                decision = {
                    ...base,
                    ...location,
                    action: "SKIP",
                };
            } else if (item.action === "USE") {
                decision = {
                    ...base,
                    ...location,
                    action: "USE",
                    sourcePath: text(item.sourcePath, 4096),
                    columnNumber: positiveInteger(
                        item.columnNumber,
                        16_384,
                    ),
                };
            } else {
                fail("რიგის მოქმედება არასწორია.");
            }
        } else {
            fail("მოქმედება არასწორია.");
        }

        const key = getProductPhotoDecisionKey(decision);

        if (keys.has(key)) {
            fail("ერთ მდებარეობაზე არჩევანი მეორდება.");
        }

        keys.add(key);
        return decision;
    });
}