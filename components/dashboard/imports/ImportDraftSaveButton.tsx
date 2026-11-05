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
import {
    checkImportSection,
    executeImportSection,
    ImportSectionUncertainError,
    type ImportSectionReceipt,
} from "@/lib/imports/run-import-section";

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
            "შენახვის პასუხი ვერ წავიკითხეთ. სცადეთ ხელახლა.",
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
            "მონახაზის ვერსია პასუხში ვერ დადასტურდა. სცადეთ ხელახლა.",
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
    const [importCompleted, setImportCompleted] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<
        Partial<Record<ImportCategory, ImportSectionReceipt>>
    >({});
    const [activeCategory, setActiveCategory] =
        useState<ImportCategory | null>(null);
    const [blocked, setBlocked] = useState<{
        category: ImportCategory;
        problems: string[];
    } | null>(null);

    // კატეგორია, რომლის შენახვის პასუხი დაიკარგა. ხელახლა
    // ცდისას პირდაპირ შენახვას ვიმეორებთ: სერვერი უკვე
    // შესრულებულს მეორედ არ შეასრულებს და შედეგს დააბრუნებს.
    const uncertain = useRef<ImportCategory | null>(null);

    const selectedCategories = (["customers", "products", "orders"] as ImportCategory[]).filter(category => {
        const mappings = category === "orders" ? settings.orderMappings ?? {}
            : category === "customers" ? settings.customerMappings : settings.productMappings;
        return Object.values(mappings).some(sheets => Object.values(sheets as Record<string, { enabled: boolean }>).some(mapping => mapping.enabled));
    });
    const running = useRef(false);
    const session = useRef<SaveSession | null>(null);

    // ერთი ღილაკი: ინახავს მონახაზს, შემდეგ თითო კატეგორიას
    // ამოწმებს და გადმოაქვს. შეჩერდება პირველსავე პრობლემაზე.
    async function transfer() {
        if (
            running.current ||
            disabled ||
            importCompleted ||
            files.length === 0 ||
            selectedCategories.length === 0
        ) return;

        running.current = true;
        setSaving(true);
        onSavingChange(true);
        setError("");
        setBlocked(null);

        const pending = selectedCategories.filter(
            category => !completedSections.includes(category),
        );
        const done = new Set(completedSections);
        const total = pending.length + 1;

        try {
            setProgress(0);
            const target = await saveDraft();

            if (!target) return;

            const current = session.current!;
            let step = 1;
            setProgress(step / total);

            for (const category of pending) {
                setActiveCategory(category);
                setMessage(`${IMPORT_CATEGORY_LABELS[category]} გადმოგვაქვს…`);

                if (uncertain.current !== category) {
                    const check = await checkImportSection({
                        draftId: target.draftId,
                        revision: current.revision,
                        category,
                    });

                    if (!check.canImport) {
                        setBlocked({ category, problems: check.problems });
                        return;
                    }
                }

                let receipt: ImportSectionReceipt;

                try {
                    receipt = await executeImportSection({
                        draftId: target.draftId,
                        revision: current.revision,
                        category,
                    });
                } catch (cause: unknown) {
                    if (cause instanceof ImportSectionUncertainError) {
                        uncertain.current = category;
                    }

                    throw cause;
                }

                uncertain.current = null;
                current.revision += 1;
                done.add(category);
                setResults(previous => ({ ...previous, [category]: receipt }));

                const allDone = selectedCategories.every(item => done.has(item));
                onSectionImported(category, allDone);

                step++;
                setProgress(step / total);

                if (allDone) setImportCompleted(true);
            }
        } catch (cause: unknown) {
            setError(
                (cause instanceof Error
                    ? cause.message
                    : "გადმოტანა შეჩერდა.") +
                (cause instanceof ImportSectionUncertainError
                    ? " დააჭირეთ „გაგრძელებას“ - უკვე შენახული მეორედ არ შეინახება."
                    : ""),
            );
        } finally {
            running.current = false;
            setActiveCategory(null);
            setMessage("");
            setSaving(false);
            onSavingChange(false);
        }
    }

    // ფაილებს, ფოტოებსა და არჩევანს სერვერზე ინახავს.
    async function saveDraft(): Promise<{
        draftId: string;
        revision: number;
    } | null> {
        setMessage("მონაცემები მზადდება…");

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
                        "შექმნილი მონახაზი ვერ დადასტურდა. სცადეთ ხელახლა.",
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
                        "შენახული ფაილის იდენტობა ვერ დადასტურდა. სცადეთ ხელახლა.",
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

            return {
                draftId: current.draftId,
                revision: current.revision,
            };
        } catch (cause: unknown) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "შენახვა ვერ დასრულდა. სცადეთ ხელახლა.",
            );

            return null;
        }
    }

    useImperativeHandle(saveRef, () => ({
        save: transfer,
    }));

    const stopped = error !== "" || blocked !== null;

    return (
        <div
            id="import-draft-save"
            className="scroll-mt-28 space-y-4"
        >
            <ul className="divide-y divide-border rounded-xl border border-border">
                {selectedCategories.map(category => {
                    const result = results[category];
                    const status = result
                        ? `${result.savedCount} დაემატა` +
                            (result.skippedCount > 0 ? ` · ${result.skippedCount} არ გადმოვიდა` : "")
                        : completedSections.includes(category)
                            ? "უკვე გადმოტანილია"
                            : activeCategory === category
                                ? "მიმდინარეობს…"
                                : blocked?.category === category
                                    ? "გასასწორებელია"
                                    : "მზადაა გადმოსატანად";
                    const doneHere = result !== undefined || completedSections.includes(category);

                    return (
                        <li key={category} className="flex items-center justify-between gap-3 p-3 text-sm">
                            <span className="font-medium">{IMPORT_CATEGORY_LABELS[category]}</span>
                            <span className={doneHere ? "text-success" : blocked?.category === category ? "text-danger" : "text-text-secondary"}>
                                {doneHere && "✓ "}{status}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {blocked && (
                <div role="alert" className="space-y-2 rounded-xl border border-danger/60 p-3 text-sm">
                    <p className="font-medium text-danger">
                        {IMPORT_CATEGORY_LABELS[blocked.category]}: გადმოტანამდე გასასწორებელია
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                        {blocked.problems.slice(0, 5).map(problem => <li key={problem}>{problem}</li>)}
                    </ul>
                    {blocked.problems.length > 5 && (
                        <p className="text-text-secondary">და კიდევ {blocked.problems.length - 5}.</p>
                    )}
                    {onReviewCategory && (
                        <button type="button" onClick={() => onReviewCategory(blocked.category)} className="min-h-11 rounded-xl border border-border px-4">
                            გასწორება
                        </button>
                    )}
                </div>
            )}

            {error && (
                <p role="alert" className="text-sm text-danger">{error}</p>
            )}

            {saving && (
                <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full bg-success transition-all" style={{ width: `${Math.max(5, Math.round(progress * 100))}%` }} />
                    </div>
                    <p role="status" className="text-sm text-text-secondary">{message}</p>
                </div>
            )}

            {!importCompleted && (
                <button
                    type="button"
                    disabled={disabled || saving || files.length === 0 || selectedCategories.length === 0}
                    onClick={() => void transfer()}
                    className="min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                >
                    {saving ? "გადმოგვაქვს…" : stopped || completedSections.length > 0 ? "გაგრძელება" : "გადმოტანა MARTEO-ში"}
                </button>
            )}

            {importCompleted && (
                <p role="status" className="text-sm font-medium text-success">
                    ყველაფერი გადმოტანილია.
                </p>
            )}
        </div>
    );
}
