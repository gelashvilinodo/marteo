"use client";

import { useEffect, useRef, useState } from "react";

import {
    validateImportDraftFile,
} from "@/lib/imports/validate-import-draft-file";
import {
    validateImportDraftSettings,
    type ImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import type {
    ParsedImportFile,
} from "@/lib/imports/import-file-types";
import {
    readSavedImportPhotos,
    type SavedImportPhoto,
} from "@/lib/imports/read-saved-import-photos";
import {
    readImportPhotoManifest,
    type ImportPhotoManifest,
} from "@/lib/imports/import-photo-manifest";
import type {
    ImportCompletedSections,
} from "@/lib/imports/read-import-completed-sections";

export type LoadedImportDraft = {
    draft: {
        id: string;
        businessId: string;
        clientRequestId: string;
        revision: number;
        status: "DRAFT" | "REVIEW" | "PARTIAL";
    };
    files: {
        fileId: string;
        clientFileId: string;
        file: ParsedImportFile;
        photos: SavedImportPhoto[];
        photoManifest: ImportPhotoManifest | null;
    }[];
    settings: ImportDraftSettings;
    hasSavedSettings: boolean;
    completedSections: ImportCompletedSections;
};

type DraftSummary = {
    id: string;
    updatedAt: string;
    fileCount: number;
};

function object(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error("მონახაზის პასუხის ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

function text(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new Error("მონახაზის პასუხი არასრულია.");
    }

    return value;
}

async function get(url: string, signal: AbortSignal) {
    const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
    });

    const body = object(await response.json());

    if (!response.ok || body.success !== true) {
        throw new Error(
            typeof body.message === "string"
                ? body.message
                : "მონახაზი ვერ ჩაიტვირთა.",
        );
    }

    return body;
}

export default function ImportDraftPicker({
    disabled,
    onOpen,
    onLoadingChange,
}: {
    disabled: boolean;
    onOpen: (draft: LoadedImportDraft) => void;
    onLoadingChange: (loading: boolean) => void;
}) {
    const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const running = useRef(false);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => controller.current?.abort();
    }, []);

    async function run(
        action: (signal: AbortSignal) => Promise<void>,
    ) {
        if (running.current || disabled) return;

        running.current = true;
        const abort = new AbortController();
        controller.current = abort;

        setBusy(true);
        setError("");
        onLoadingChange(true);

        try {
            await action(abort.signal);
        } catch (cause: unknown) {
            if (!abort.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "მონახაზი ვერ ჩაიტვირთა.",
                );
            }
        } finally {
            running.current = false;

            if (!abort.signal.aborted) {
                setBusy(false);
                onLoadingChange(false);
            }
        }
    }

    function loadList() {
        void run(async signal => {
            const body = await get("/api/imports/drafts", signal);

            if (!Array.isArray(body.drafts)) {
                throw new Error("მონახაზების სია არასრულია.");
            }

            const list = body.drafts.map((raw: unknown) => {
                const item = object(raw);
                const count = object(item._count);
                const updatedAt = text(item.updatedAt);

                if (
                    !Number.isFinite(Date.parse(updatedAt)) ||
                    typeof count.files !== "number" ||
                    !Number.isSafeInteger(count.files) ||
                    count.files < 0
                ) {
                    throw new Error("მონახაზების სიის მონაცემები არასწორია.");
                }

                return {
                    id: text(item.id),
                    updatedAt,
                    fileCount: count.files,
                };
            });

            if (!signal.aborted) setDrafts(list);
        });
    }

    function openDraft(id: string) {
        void run(async signal => {
            const body = await get(
                `/api/imports/drafts/${encodeURIComponent(id)}`,
                signal,
            );

            const draft = object(body.draft);
            const status = draft.status;

            if (
                draft.id !== id ||
                draft.schemaVersion !== 1 ||
                (
                    status !== "DRAFT" &&
                    status !== "REVIEW" &&
                    status !== "PARTIAL"
                ) ||
                typeof draft.revision !== "number" ||
                !Number.isSafeInteger(draft.revision) ||
                draft.revision < 1 ||
                !Array.isArray(body.files) ||
                typeof body.hasSavedSettings !== "boolean"
            ) {
                throw new Error("მონახაზის სრული აღდგენა ვერ დადასტურდა.");
            }

            const businessId = text(draft.businessId);
            const sectionData = object(body.completedSections);

            if (
                typeof sectionData.customers !== "boolean" ||
                typeof sectionData.products !== "boolean" ||
                typeof sectionData.orders !== "boolean"
            ) {
                throw new Error(
                    "მონახაზის შესრულებული განყოფილებები ვერ დადასტურდა.",
                );
            }

            const completedSections: ImportCompletedSections = {
                customers: sectionData.customers,
                products: sectionData.products,
                orders: sectionData.orders,
            };

            const hasCompletedSection =
                completedSections.customers ||
                completedSections.products ||
                completedSections.orders;

            if (
                (status === "PARTIAL") !== hasCompletedSection
            ) {
                throw new Error(
                    "მონახაზის მდგომარეობა შესრულების შედეგებს არ ემთხვევა.",
                );
            }
            const ids = new Set<string>();

            const files = body.files.map((raw: unknown) => {
                const item = object(raw);
                const clientFileId = text(item.clientFileId);

                if (ids.has(clientFileId)) {
                    throw new Error("მონახაზში ფაილის იდენტობა მეორდება.");
                }

                ids.add(clientFileId);

                const file = validateImportDraftFile(item.file);

                return {
                    fileId: text(item.fileId),
                    clientFileId,
                    file,
                    photos: readSavedImportPhotos(
                        item.photos,
                        businessId,
                        file,
                    ),
                    photoManifest: readImportPhotoManifest(
                        item.photoManifest,
                        file,
                    ),
                };
            });

            const loaded: LoadedImportDraft = {
                draft: {
                    id,
                    businessId,
                    clientRequestId: text(draft.clientRequestId),
                    revision: draft.revision,
                    status,
                },
                files,
                settings: validateImportDraftSettings(
                    body.settings,
                    businessId,
                ),
                hasSavedSettings: body.hasSavedSettings,
                completedSections,
            };

            if (!signal.aborted) onOpen(loaded);
        });
    }

    return (
        <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4">
            <h2 className="font-semibold">
                შენახული მონახაზები
            </h2>

            <p className="text-sm text-text-secondary">
                მონახაზის გახსნა ამ გვერდზე არსებულ სამუშაოს
                ჩაანაცვლებს. მიმდინარე ცვლილებები ჯერ შეინახე.
            </p>

            <button
                type="button"
                disabled={disabled || busy}
                onClick={loadList}
                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
            >
                {busy
                    ? "იტვირთება…"
                    : drafts === null
                        ? "მონახაზების ნახვა"
                        : "სიის განახლება"}
            </button>

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {drafts?.length === 0 && (
                <p className="text-sm text-text-secondary">
                    აქტიური მონახაზები არ მოიძებნა.
                </p>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto">
                {drafts?.map(draft => (
                    <div
                        key={draft.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                    >
                        <div>
                            <p>
                                {new Date(draft.updatedAt).toLocaleString(
                                    "ka-GE",
                                )}
                            </p>
                            <p className="text-text-secondary">
                                {draft.fileCount} ფაილი
                            </p>
                        </div>

                        <button
                            type="button"
                            disabled={disabled || busy}
                            onClick={() => openDraft(draft.id)}
                            className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
                        >
                            გახსნა
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}