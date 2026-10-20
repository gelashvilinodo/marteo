"use client";

import { useEffect, useState } from "react";

import type { ParsedImportFile } from "@/lib/imports/import-file-types";
import type { ImportPhotoManifest } from "@/lib/imports/import-photo-manifest";
import type { PreparedImportPhoto } from "@/lib/imports/prepare-import-photos";
import type { SavedImportPhoto } from "@/lib/imports/read-saved-import-photos";

import type {
    ProductImportMapping,
    ProductImportEdits,
} from "@/lib/imports/product-import-mapping";

import {
    prepareImportProducts,
    type PreparedImportProduct,
} from "@/lib/imports/prepare-import-products";

import {
    getProductPhotoDecisionToken,
    type ProductPhotoDecision,
} from "@/lib/imports/product-photo-decisions";

import {
    resolveProductPhotoDecision,
} from "@/lib/imports/resolve-product-photo-decision";

type Candidate = {
    sourcePath: string;
    columnNumber: number;
    file: File | null;
    imageUrl: string | null;
};

const EMPTY_PREPARED: readonly PreparedImportPhoto[] = [];
const EMPTY_SAVED: readonly SavedImportPhoto[] = [];

export default function ImportRowPhotoChoices({
    clientFileId,
    file,
    mappings,
    edits,
    excludedKeys,
    manifest,
    preparedPhotos = EMPTY_PREPARED,
    savedPhotos = EMPTY_SAVED,
    decisions,
    onChange,
}: {
    clientFileId: string;
    file: ParsedImportFile;
    mappings: Record<string, ProductImportMapping>;
    edits: Record<string, ProductImportEdits>;
    excludedKeys: readonly string[];
    manifest: ImportPhotoManifest | null;
    preparedPhotos?: readonly PreparedImportPhoto[];
    savedPhotos?: readonly SavedImportPhoto[];
    decisions: readonly ProductPhotoDecision[];
    onChange: (next: ProductPhotoDecision[]) => void;
}) {
    const [urls, setUrls] = useState<Map<File, string>>(
        () => new Map(),
    );

    useEffect(() => {
        const next: Map<File, string> = new Map<File, string>();
        let active = true;
        // Blob URLs are external resources. Cancel deferred setup on unmount
        // and release only the URLs owned by this effect.
        queueMicrotask(() => {
            if (!active) return;
            try {
                for (const photo of preparedPhotos) {
                    if (!next.has(photo.file)) next.set(photo.file, URL.createObjectURL(photo.file));
                }
            } catch {
                for (const url of next.values()) URL.revokeObjectURL(url);
                next.clear();
            }
            setUrls(next);
        });
        return () => {
            active = false;
            for (const url of next.values()) URL.revokeObjectURL(url);
        };
    }, [preparedPhotos]);

    const sources = file.sheets.flatMap(sheet => {
        const mapping = mappings[sheet.name];

        return mapping?.enabled
            ? [{
                fileId: clientFileId,
                fileName: file.originalName,
                sheet,
                mapping,
                edits: edits[sheet.name],
            }]
            : [];
    });

    const prepared = prepareImportProducts(
        sources,
        excludedKeys,
    );

    const candidatesByRow = new Map<
        string,
        Map<string, Candidate>
    >();

    function addCandidate(
        sheetName: string,
        rowNumber: number,
        candidate: Candidate,
    ) {
        const rowKey = JSON.stringify([sheetName, rowNumber]);
        const candidateKey = JSON.stringify([
            candidate.sourcePath,
            candidate.columnNumber,
        ]);

        let group = candidatesByRow.get(rowKey);

        if (!group) {
            group = new Map();
            candidatesByRow.set(rowKey, group);
        }

        group.set(candidateKey, candidate);
    }

    for (const photo of savedPhotos) {
        addCandidate(photo.sheetName, photo.rowNumber, {
            sourcePath: photo.sourcePath,
            columnNumber: photo.columnNumber,
            file: null,
            imageUrl: photo.imageUrl,
        });
    }

    for (const photo of preparedPhotos) {
        addCandidate(photo.sheetName, photo.rowNumber, {
            sourcePath: photo.sourcePath,
            columnNumber: photo.columnNumber,
            file: photo.file,
            imageUrl: null,
        });
    }

    const selectedSheets = new Set(
        sources.map(source => source.sheet.name),
    );

    const commonIssues = manifest === null
        ? file.format === "csv"
            ? []
            : ["ამ მონახაზში წყაროს ფოტოების საწყისი სია არ არის."]
        : manifest.issues
            .filter(issue =>
                issue.rowNumber === null &&
                (
                    issue.sheetName === null ||
                    selectedSheets.has(issue.sheetName)
                ),
            )
            .map(issue => issue.message);

    const rows = prepared.records.flatMap(record => {
        const key = JSON.stringify([
            record.sheetName,
            record.rowNumber,
        ]);

        const candidates = [
            ...(candidatesByRow.get(key)?.values() ?? []),
        ];

        const issues = manifest?.issues.filter(issue =>
            issue.sheetName === record.sheetName &&
            issue.rowNumber === record.rowNumber,
        ) ?? [];

        const expected = manifest?.sources.filter(photo =>
            photo.sheetName === record.sheetName &&
            photo.rowNumber === record.rowNumber,
        ) ?? [];

        const missing = expected.some(photo =>
            !candidates.some(candidate =>
                candidate.sourcePath === photo.sourcePath &&
                candidate.columnNumber === photo.columnNumber,
            ),
        );

        const resolved = resolveProductPhotoDecision({
            decisions,
            clientFileId,
            sha256: file.sha256,
            sheetName: record.sheetName,
            rowNumber: record.rowNumber,
        });

        const reference =
            record.data?.imageReference ??
            record.input.imageReference;

        const missingReference =
            typeof reference === "string" &&
            reference.trim() !== "" &&
            candidates.length === 0;

        const needsReview =
            candidates.length > 1 ||
            issues.length > 0 ||
            missing ||
            missingReference ||
            commonIssues.length > 0 ||
            resolved.stale ||
            resolved.decision !== null;

        return needsReview
            ? [{ record, candidates, issues, missing, resolved }]
            : [];
    });

    const fileToken = getProductPhotoDecisionToken(
        { clientFileId, sha256: file.sha256 },
        { scope: "FILE" },
    );

    const skipAll = decisions.some(decision =>
        decision.clientFileId === clientFileId &&
        decision.scope === "FILE" &&
        decision.token === fileToken &&
        decision.action === "SKIP_ALL",
    );

    function choose(
        record: PreparedImportProduct,
        selection: Candidate | "SKIP" | null,
    ) {
        const remaining = decisions.filter(decision => {
            if (decision.clientFileId !== clientFileId) return true;
            if (decision.scope === "FILE") return false;

            return (
                decision.sheetName !== record.sheetName ||
                decision.rowNumber !== record.rowNumber
            );
        });

        if (selection === null) {
            onChange(remaining);
            return;
        }

        const location = {
            scope: "ROW" as const,
            sheetName: record.sheetName,
            rowNumber: record.rowNumber,
        };

        const base = {
            clientFileId,
            ...location,
            token: getProductPhotoDecisionToken(
                { clientFileId, sha256: file.sha256 },
                location,
            ),
        };

        const decision: ProductPhotoDecision =
            selection === "SKIP"
                ? { ...base, action: "SKIP" }
                : {
                    ...base,
                    action: "USE",
                    sourcePath: selection.sourcePath,
                    columnNumber: selection.columnNumber,
                };

        onChange([...remaining, decision]);
    }

    if (sources.length === 0 || skipAll || rows.length === 0) {
        return null;
    }

    return (
        <details className="mt-3 rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">
                ფოტოების არჩევა / გამოტოვება ({rows.length})
            </summary>

            {commonIssues.length > 0 && (
                <div className="mt-3 space-y-1 text-sm text-danger">
                    {[...new Set(commonIssues)].map(message => (
                        <p key={message}>{message}</p>
                    ))}
                    <p className="text-text-secondary">
                        შეგიძლია რიგებისთვის ფოტოები აირჩიო,
                        ან ზემოთ მთელი ფაილის ფოტოები გამოტოვო.
                    </p>
                </div>
            )}

            <div className="mt-3 space-y-3">
                {rows.map(({ record, candidates, issues, missing, resolved }) => {
                    const decision = resolved.decision;
                    const skipped = decision?.action === "SKIP";

                    return (
                        <section
                            key={record.key}
                            className="space-y-3 rounded-xl border border-border p-3"
                        >
                            <h3 className="text-sm font-semibold">
                                {record.data?.name ?? "პროდუქტი"}
                                {" — "}
                                {record.sheetName}
                                {", რიგი "}
                                {record.rowNumber}
                            </h3>

                            {issues.length > 0 && (
                                <p className="text-xs text-text-secondary">
                                    {[...new Set(
                                        issues.map(issue => issue.message),
                                    )].join(" ")}
                                </p>
                            )}

                            {missing && (
                                <p className="text-xs text-danger">
                                    წყაროს ერთ-ერთი ფოტო ვერ მომზადდა
                                    ან ამ გვერდზე აღარ არის.
                                </p>
                            )}

                            {resolved.stale && (
                                <p className="text-xs text-danger">
                                    წინა არჩევანი მოძველებულია.
                                    დაადასტურე ხელახლა.
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {candidates.map((candidate, index) => {
                                    const selected =
                                        decision?.action === "USE" &&
                                        decision.sourcePath === candidate.sourcePath &&
                                        decision.columnNumber === candidate.columnNumber;

                                    const url = candidate.file
                                        ? urls.get(candidate.file)
                                        : candidate.imageUrl;

                                    return (
                                        <button
                                            key={JSON.stringify([
                                                candidate.sourcePath,
                                                candidate.columnNumber,
                                            ])}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => choose(record, candidate)}
                                            className={[
                                                "rounded-xl border p-2 text-left text-xs",
                                                selected
                                                    ? "border-accent bg-accent/10"
                                                    : "border-border",
                                            ].join(" ")}
                                        >
                                            {url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={url}
                                                    alt={`ფოტო ${index + 1}`}
                                                    loading="lazy"
                                                    className="h-24 w-full object-contain"
                                                />
                                            ) : (
                                                <span className="block py-6">
                                                    პრევიუ ვერ გამოჩნდა
                                                </span>
                                            )}

                                            <span className="mt-2 block">
                                                ფოტო {index + 1}
                                                {selected ? " — არჩეულია" : " — არჩევა"}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    aria-pressed={skipped}
                                    onClick={() => choose(record, "SKIP")}
                                    className={[
                                        "min-h-11 rounded-xl border px-3 text-sm",
                                        skipped
                                            ? "border-accent bg-accent/10"
                                            : "border-border",
                                    ].join(" ")}
                                >
                                    {skipped
                                        ? "ფოტო გამოტოვებულია"
                                        : "ფოტოს გარეშე გადმოტანა"}
                                </button>

                                {(decision !== null || resolved.stale) && (
                                    <button
                                        type="button"
                                        onClick={() => choose(record, null)}
                                        className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                    >
                                        არჩევანის გაუქმება
                                    </button>
                                )}
                            </div>

                            <p className="text-xs text-text-secondary">
                                არჩევანის შემდეგ მონახაზი ხელახლა შეინახე.
                            </p>
                        </section>
                    );
                })}
            </div>
        </details>
    );
}
