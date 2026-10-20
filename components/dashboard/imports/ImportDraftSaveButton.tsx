"use client";

import {
    useImperativeHandle,
    useRef,
    useState,
    type Ref,
} from "react";

import type {
    ParsedImportFile,
} from "@/lib/imports/import-file-types";
import type {
    ImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import type {
    LoadedImportDraft,
} from "./ImportDraftPicker";
import ImportDraftProductsCheck from "./ImportDraftProductsCheck";
import ImportDraftCustomersCheck from "./ImportDraftCustomersCheck";
import type {
    PreparedImportPhoto,
} from "@/lib/imports/prepare-import-photos";

import {
    uploadImportPhoto,
    ImportPhotoUploadError,
} from "@/lib/imports/upload-import-photo";
import type {
    ImportPhotoManifest,
} from "@/lib/imports/import-photo-manifest";
import ImportDraftOrdersCheck from "./ImportDraftOrdersCheck";

type DraftFile = {
    clientFileId: string;
    file: ParsedImportFile;
    photos?: readonly PreparedImportPhoto[];
    photoManifest?: ImportPhotoManifest | null;
};

type PendingPhoto = {
    clientFileId: string;
    expectedRevision: number;
    photo: PreparedImportPhoto;
};

function photoToken(
    clientFileId: string,
    photo: PreparedImportPhoto,
): string {
    return JSON.stringify([
        clientFileId,
        photo.sheetName,
        photo.rowNumber,
        photo.columnNumber,
        photo.sourcePath,
    ]);
}

function fileSignature(item: DraftFile) {
    return {
        id: item.clientFileId,
        sha256: item.file.sha256,
        photoManifest: item.photoManifest ?? null,
        photos: (item.photos ?? []).map(photo => ({
            sourcePath: photo.sourcePath,
            sheetName: photo.sheetName,
            rowNumber: photo.rowNumber,
            columnNumber: photo.columnNumber,
            name: photo.file.name,
            size: photo.file.size,
            lastModified: photo.file.lastModified,
        })),
    };
}

type PendingSettings = {
    clientRequestId: string;
    expectedRevision: number;
    settings: ImportDraftSettings;
    signature: string;
};

type SaveSession = {
    clientRequestId: string;
    draftId: string | null;
    revision: number;
    savedFiles: Set<string>;
    savedPhotos: Map<string, File>;
    pendingPhoto: PendingPhoto | null;
    pendingSettings: PendingSettings | null;
    savedSignature: string | null;
};

async function post(
    url: string,
    body: unknown,
): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const raw: unknown = await response.json();

    if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw)
    ) {
        throw new Error(
            "შენახვის პასუხი ვერ წავიკითხეთ. სცადე ხელახლა.",
        );
    }

    const result = raw as Record<string, unknown>;

    if (!response.ok || result.success !== true) {
        throw new Error(
            typeof result.message === "string"
                ? result.message
                : "მონახაზის შენახვა ვერ დასრულდა.",
        );
    }

    return result;
}

function revision(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1
    ) {
        throw new Error(
            "მონახაზის ვერსია პასუხში ვერ დადასტურდა. სცადე ხელახლა.",
        );
    }

    return value;
}

import { IMPORT_CATEGORY_LABELS, type ImportCategory } from "@/lib/imports/discover-import-sources";

export type ImportDraftSaveHandle = {
    save: () => Promise<void>;
};

export default function ImportDraftSaveButton({
    files,
    settings,
    disabled,
    initialDraft,
    onSavingChange,
    onSectionImported,
    saveRef,
    completedSections = [],
    onReviewCategory,
}: {
    onReviewCategory?: (category: ImportCategory) => void;
    completedSections?: ImportCategory[];
    saveRef?: Ref<ImportDraftSaveHandle>;
    files: DraftFile[];
    settings: ImportDraftSettings;
    disabled: boolean;
    initialDraft: LoadedImportDraft | null;
    onSavingChange: (saving: boolean) => void;
    onSectionImported: (category: ImportCategory, allDone: boolean) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [importLocked, setImportLocked] = useState(false);
    const [activeExecution, setActiveExecution] = useState<
        "CUSTOMERS" | "PRODUCTS" | "ORDERS" | null
    >(null);
    const [importCompleted, setImportCompleted] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const [checkTarget, setCheckTarget] = useState<{
        draftId: string;
        revision: number;
        signature: string;
    } | null>(null);

    const currentSignature = JSON.stringify({
        files: files.map(fileSignature),
        settings,
    });

    const selectedCategories = (["customers", "products", "orders"] as ImportCategory[]).filter(category => {
        const mappings = category === "orders" ? settings.orderMappings ?? {}
            : category === "customers" ? settings.customerMappings : settings.productMappings;
        return Object.values(mappings).some(sheets => Object.values(sheets as Record<string, { enabled: boolean }>).some(mapping => mapping.enabled));
    });
    const nextCategory = selectedCategories.find(category => !completedSections.includes(category));
    function sectionImported(category: ImportCategory) {
        const allDone = selectedCategories.every(item => item === category || completedSections.includes(item));
        if (session.current) session.current.revision += 1;
        setCheckTarget(current => current ? { ...current, revision: current.revision + 1 } : null);
        setImportCompleted(allDone);
        setMessage(allDone ? "ყველა მონიშნული კატეგორია გადმოტანილია." : `${IMPORT_CATEGORY_LABELS[category]} გადმოტანილია. გააგრძელე შემდეგი კატეგორიით.`);
        onSectionImported(category, allDone);
    }

    const running = useRef(false);
    const session = useRef<SaveSession | null>(null);

    useImperativeHandle(saveRef, () => ({
        save,
    }));

    async function save() {
        if (
            running.current ||
            disabled ||
            importLocked ||
            importCompleted ||
            files.length === 0 ||
            selectedCategories.length === 0
        ) return;

        running.current = true;
        setSaving(true);
        onSavingChange(true);
        setError("");
        setCheckTarget(null);
        setMessage("მონახაზი ინახება…");

        // ვინახავთ ღილაკზე დაჭერის მომენტში არსებულ არჩევანს.
        const capturedSettings = JSON.parse(
            JSON.stringify(settings),
        ) as ImportDraftSettings;

        const capturedFiles = [...files];

        const signature = JSON.stringify({
            files: capturedFiles.map(fileSignature),
            settings: capturedSettings,
        });

        if (!session.current) {
            session.current = {
                clientRequestId:
                    initialDraft?.draft.clientRequestId ??
                    crypto.randomUUID(),
                draftId: initialDraft?.draft.id ?? null,
                revision: initialDraft?.draft.revision ?? 1,
                savedFiles: new Set(
                    initialDraft?.files.map(item => item.clientFileId) ?? [],
                ),
                savedPhotos: new Map(),
                pendingPhoto: null,
                pendingSettings: null,
                savedSignature: null,
            };
        }

        const current = session.current;

        try {
            if (!current.draftId) {
                const response = await post("/api/imports/drafts", {
                    clientRequestId: current.clientRequestId,
                });

                const rawDraft = response.draft;

                if (
                    typeof rawDraft !== "object" ||
                    rawDraft === null ||
                    Array.isArray(rawDraft)
                ) {
                    throw new Error(
                        "შექმნილი მონახაზი ვერ დადასტურდა. სცადე ხელახლა.",
                    );
                }

                const draft = rawDraft as Record<string, unknown>;

                if (
                    typeof draft.id !== "string" ||
                    draft.schemaVersion !== 1 ||
                    !["DRAFT", "REVIEW"].includes(String(draft.status))
                ) {
                    throw new Error(
                        "მონახაზის მდგომარეობა შენახვის გაგრძელების საშუალებას არ იძლევა.",
                    );
                }

                const receivedRevision = revision(draft.revision);

                current.draftId = draft.id;
                current.revision = receivedRevision;
            }

            const baseUrl =
                `/api/imports/drafts/${encodeURIComponent(current.draftId)}`;

            async function finishPendingPhoto() {
                const pending = current.pendingPhoto;

                if (!pending) return;

                let receipt: Awaited<
                    ReturnType<typeof uploadImportPhoto>
                >;

                try {
                    receipt = await uploadImportPhoto({
                        draftId: current.draftId!,
                        clientFileId: pending.clientFileId,
                        expectedRevision: pending.expectedRevision,
                        photo: pending.photo,
                    });
                } catch (cause: unknown) {
                    if (
                        cause instanceof ImportPhotoUploadError &&
                        cause.confirmedNotSaved
                    ) {
                        current.pendingPhoto = null;
                    }

                    throw cause;
                }

                current.revision = receipt.revision;

                current.savedPhotos.set(
                    photoToken(
                        pending.clientFileId,
                        pending.photo,
                    ),
                    pending.photo.file,
                );

                current.pendingPhoto = null;
                current.savedSignature = null;
            }

            async function finishPendingSettings() {
                const pending = current.pendingSettings;

                if (!pending) return;

                const response = await post(`${baseUrl}/settings`, {
                    clientRequestId: pending.clientRequestId,
                    expectedRevision: pending.expectedRevision,
                    settings: pending.settings,
                });

                current.revision = revision(response.revision);
                current.savedSignature = pending.signature;
                current.pendingSettings = null;
            }

            if (current.pendingPhoto) {
                setMessage("წინა ფოტოს შენახვის შედეგი მოწმდება…");
                await finishPendingPhoto();
            }

            // გაურკვევლად დასრულებული მოთხოვნა ჯერ იგივე
            // იდენტიფიკატორით უნდა დავადასტუროთ.
            if (current.pendingSettings) {
                setMessage("წინა შენახვის შედეგი მოწმდება…");
                await finishPendingSettings();
            }

            for (let index = 0; index < capturedFiles.length; index++) {
                const item = capturedFiles[index];

                if (
                    initialDraft?.draft.status === "PARTIAL" ||
                    current.savedFiles.has(item.clientFileId)
                ) continue;

                setMessage(
                    `ფაილი ინახება: ${index + 1} / ${capturedFiles.length}`,
                );

                const response = await post(`${baseUrl}/files`, {
                    clientFileId: item.clientFileId,
                    expectedRevision: current.revision,
                    file: item.file,
                    photoManifest: item.photoManifest ?? null,
                });

                if (
                    response.clientFileId !== item.clientFileId ||
                    typeof response.fileId !== "string"
                ) {
                    throw new Error(
                        "შენახული ფაილის იდენტობა ვერ დადასტურდა. სცადე ხელახლა.",
                    );
                }

                current.revision = revision(response.revision);
                current.savedFiles.add(item.clientFileId);
            }

            const photoUploads =
                initialDraft?.draft.status === "PARTIAL"
                    ? []
                    : capturedFiles.flatMap(item =>
                        (item.photos ?? []).map(photo => ({
                            clientFileId: item.clientFileId,
                            photo,
                        })),
                    );

            for (
                let index = 0;
                index < photoUploads.length;
                index++
            ) {
                const item = photoUploads[index];

                const token = photoToken(
                    item.clientFileId,
                    item.photo,
                );

                if (
                    current.savedPhotos.get(token) ===
                    item.photo.file
                ) {
                    continue;
                }

                setMessage(
                    `ფოტო ინახება: ${index + 1} / ${photoUploads.length}`,
                );

                current.pendingPhoto = {
                    clientFileId: item.clientFileId,
                    expectedRevision: current.revision,
                    photo: item.photo,
                };

                await finishPendingPhoto();
            }

            if (current.savedSignature !== signature) {
                setMessage("არჩევანი და შესწორებები ინახება…");

                current.pendingSettings = {
                    clientRequestId: crypto.randomUUID(),
                    expectedRevision: current.revision,
                    settings: capturedSettings,
                    signature,
                };

                await finishPendingSettings();
            }

            setCheckTarget({
                draftId: current.draftId,
                revision: current.revision,
                signature,
            });

            setMessage(
                "მონახაზი შენახულია. შენახვის დაწყების შემდეგ შეტანილი ცვლილებები ხელახლა შეინახე.",
            );
        } catch (cause: unknown) {
            setMessage("");
            setError(
                cause instanceof Error
                    ? cause.message
                    : "შენახვა ვერ დასრულდა. სცადე ხელახლა.",
            );
        } finally {
            running.current = false;
            setSaving(false);
            onSavingChange(false);
        }
    }

    return (
        <div
            id="import-draft-save"
            className="scroll-mt-28 space-y-2 border-t border-border pt-3"
        >
            <button
                type="button"
                hidden={importCompleted || (checkTarget?.signature === currentSignature && !saving)}
                disabled={disabled || saving || importLocked || importCompleted || files.length === 0 || selectedCategories.length === 0}
                onClick={() => void save()}
                className="min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
                {saving
                    ? "ინახება…"
                    : initialDraft?.draft.status === "PARTIAL"
                        ? "დარჩენილი იმპორტის გაგრძელება"
                        : "მონაცემების მომზადება და შემოწმება"}
            </button>

            {message && (
                <p role="status" className="text-sm text-text-secondary">
                    {message}
                </p>
            )}

            {error && (
                <div role="alert" className="space-y-1 text-sm">
                    <p className="text-danger">{error}</p>
                    <p className="text-text-secondary">
                        გვერდი არ განაახლო. ხელახლა შენახვა
                        უკვე დასრულებულ ნაბიჯებს აღარ გაიმეორებს.
                    </p>
                </div>
            )}

            {checkTarget && !importCompleted && nextCategory && <div className="space-y-2 rounded-xl bg-accent/10 p-3 text-sm">
                <p>ახლა გადმოგვაქვს: <strong>{IMPORT_CATEGORY_LABELS[nextCategory]}</strong>. შემდეგი კატეგორია დასრულების შემდეგ გამოჩნდება.</p>
                {onReviewCategory && <button type="button" disabled={saving || importLocked} onClick={() => onReviewCategory(nextCategory)} className="min-h-10 rounded-lg border border-border px-3 disabled:opacity-50">ამ კატეგორიის მონაცემების შესწორება</button>}
            </div>}
            {checkTarget &&
                checkTarget.signature === currentSignature &&
                !saving && (
                    <div className="space-y-3">
                        {nextCategory === "customers" &&
                            Object.values(
                                settings.customerMappings,
                            ).some(sheets =>
                                Object.values(sheets).some(
                                    mapping => mapping.enabled,
                                ),
                            ) && (
                                <ImportDraftCustomersCheck
                                    key={`customers:${checkTarget.draftId}:${checkTarget.revision}`}
                                    draftId={checkTarget.draftId}
                                    revision={checkTarget.revision}
                                    disabled={
                                        disabled ||
                                        importCompleted ||
                                        (
                                            activeExecution !== null &&
                                            activeExecution !== "CUSTOMERS"
                                        )
                                    }
                                    onExecutionLockChange={locked => {
                                        setImportLocked(locked);
                                        setActiveExecution(
                                            locked ? "CUSTOMERS" : null,
                                        );
                                        onSavingChange(locked);
                                    }}
                                    onImported={() => sectionImported("customers")}
                                />
                            )}

                        {nextCategory === "products" &&
                            Object.values(
                                settings.productMappings,
                            ).some(sheets =>
                                Object.values(sheets).some(
                                    mapping => mapping.enabled,
                                ),
                            ) && (
                                <ImportDraftProductsCheck
                                    key={`products:${checkTarget.draftId}:${checkTarget.revision}`}
                                    draftId={checkTarget.draftId}
                                    revision={checkTarget.revision}
                                    disabled={
                                        disabled ||
                                        importCompleted ||
                                        (
                                            activeExecution !== null &&
                                            activeExecution !== "PRODUCTS"
                                        )
                                    }
                                    onExecutionLockChange={locked => {
                                        setImportLocked(locked);
                                        setActiveExecution(
                                            locked ? "PRODUCTS" : null,
                                        );
                                        onSavingChange(locked);
                                    }}
                                    onImported={() => sectionImported("products")}
                                />
                            )}

                        {nextCategory === "orders" &&
                            Object.values(
                                settings.orderMappings ?? {},
                            ).some(sheets =>
                                Object.values(sheets).some(
                                    mapping => mapping.enabled,
                                ),
                            ) && (
                                <ImportDraftOrdersCheck
                                    key={`orders:${checkTarget.draftId}:${checkTarget.revision}`}
                                    draftId={checkTarget.draftId}
                                    revision={checkTarget.revision}
                                    disabled={
                                        disabled ||
                                        importCompleted ||
                                        (
                                            activeExecution !== null &&
                                            activeExecution !== "ORDERS"
                                        )
                                    }
                                    onExecutionLockChange={locked => {
                                        setImportLocked(locked);
                                        setActiveExecution(
                                            locked ? "ORDERS" : null,
                                        );
                                        onSavingChange(locked);
                                    }}
                                    onImported={() => sectionImported("orders")}
                                />
                            )}
                    </div>
                )}

            {checkTarget &&
                checkTarget.signature !== currentSignature && (
                    <p className="text-sm text-text-secondary">
                        მონაცემები შეიცვალა. სერვერზე შემოწმებამდე
                        მონახაზი ხელახლა შეინახე.
                    </p>
                )}

            <p className="text-xs text-text-secondary">
                მონაცემები ბიზნესში ემატება მხოლოდ შესაბამისი კატეგორიის
                საბოლოო გადმოტანის დადასტურებით. მანამდე შეგიძლია დაბრუნდე
                და შესწორებები შეიტანო.
            </p>
        </div>
    );
}