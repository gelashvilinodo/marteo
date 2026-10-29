"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { readImportFile } from "@/lib/imports/read-import-file-client";
import type { ParsedImportFile } from "@/lib/imports/import-file-types";
import type { ImportPhotoReadResult } from "@/lib/imports/import-photo-types";
import {
    prepareImportPhotos,
    type PreparedImportPhoto,
} from "@/lib/imports/prepare-import-photos";
import type { ImportReadStage } from "@/lib/imports/import-worker-types";
import ImportSourceIssues from "./ImportSourceIssues";
import ImportEmbeddedPhotoPreview from "./ImportEmbeddedPhotoPreview";
import ImportSavedPhotoPreview from "./ImportSavedPhotoPreview";

import type {
    SavedImportPhoto,
} from "@/lib/imports/read-saved-import-photos";
import CustomerColumnMapping from "./CustomerColumnMapping";
import ImportCustomersSummary from "./ImportCustomersSummary";
import ImportProductsSummary from "./ImportProductsSummary";
import { prepareImportProducts } from "@/lib/imports/prepare-import-products";
import { resolveImportProductDuplicates } from "@/lib/imports/resolve-import-product-duplicates";
import { buildProductImportPlan } from "@/lib/imports/build-product-import-plan";
import { getProductStockDateReview } from "@/lib/imports/product-stock-date-review";
import ImportDraftSaveButton, {
    type ImportDraftSaveHandle,
} from "./ImportDraftSaveButton";
import ProductColumnMapping from "./ProductColumnMapping";
import {
    createProductImportMapping,
    type ProductImportMapping,
    type ProductImportEdits,
} from "@/lib/imports/product-import-mapping";

import type {
    ImportProductCheckSnapshot,
} from "@/lib/imports/match-import-products";

import type {
    ImportCustomerEdits,
    ImportCustomerEditHandler,
    ImportCustomerMapping,
    ImportExistingCustomerLinks,
    ImportCustomerCheckSnapshot,
} from "@/lib/imports/import-types";

import ImportDraftPicker, {
    type LoadedImportDraft,
} from "./ImportDraftPicker";

import type {
    ImportExistingProductLinks,
} from "@/lib/imports/product-import-links";

import type {
    ProductDuplicateDecision,
} from "@/lib/imports/resolve-import-product-duplicates";

import type {
    ProductStockPolicy,
} from "@/lib/imports/product-stock-policy";
import {
    createImportPhotoManifest,
    type ImportPhotoManifest,
} from "@/lib/imports/import-photo-manifest";
import type {
    ProductPhotoDecision,
} from "@/lib/imports/product-photo-decisions";
import ImportFilePhotoChoice from "./ImportFilePhotoChoice";

import {
    resolveProductPhotoDecision,
} from "@/lib/imports/resolve-product-photo-decision";
import ImportRowPhotoChoices from "./ImportRowPhotoChoices";
import OrderColumnMapping from "./OrderColumnMapping";
import {
    createOrderImportMapping,
    type OrderImportMapping,
} from "@/lib/imports/order-import-mapping";
import OrderImportOptionsPicker from "./OrderImportOptionsPicker";
import {
    createOrderImportOptions,
    type OrderImportOptions,
} from "@/lib/imports/order-import-options";
import ImportOrdersSummary from "./ImportOrdersSummary";
import type {
    OrderCustomerDecisions,
} from "@/lib/imports/order-customer-decisions";
import type {
    ImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import type {
    OrderImportEdits,
} from "@/lib/imports/order-import-mapping";

import {
    createDiscoveredMappings, discoverImportSources,
    IMPORT_CATEGORY_LABELS, IMPORT_CATEGORY_ORDER,
    type ImportCategory,
} from "@/lib/imports/discover-import-sources";

import { getOrderImportNeeds } from "@/lib/imports/get-order-import-needs";

type ImportStep = "files" | ImportCategory | "review";

type FileEntry = {
    id: string;
    name: string;
    state: "WAITING" | "READING" | "PARSING" | "READY" | "ERROR";
    result: ParsedImportFile | null;
    photoResult?: ImportPhotoReadResult;
    photoManifest?: ImportPhotoManifest | null;
    preparedPhotos?: PreparedImportPhoto[];
    savedPhotos?: SavedImportPhoto[];
    photoProgress?: {
        completed: number;
        total: number;
    };
    error: string;
};

function FilePreview({
    result,
    category,
    customerEdits,
    onCustomerEdit,
    customerMappings,
    onCustomerMappingChange,
    productMappings,
    onProductMappingChange,
    orderMappings,
    onOrderMappingChange,
}: {
    orderMappings: Record<string, OrderImportMapping>;
    onOrderMappingChange: (
        sheetName: string,
        mapping: OrderImportMapping,
    ) => void;
    result: ParsedImportFile;
    category: ImportCategory;
    productMappings: Record<string, ProductImportMapping>;
    onProductMappingChange: (
        sheetName: string,
        mapping: ProductImportMapping,
    ) => void;
    customerEdits: Record<string, ImportCustomerEdits>;
    onCustomerEdit: (
        sheetName: string,
        ...args: Parameters<ImportCustomerEditHandler>
    ) => void;
    customerMappings: Record<string, ImportCustomerMapping>;
    onCustomerMappingChange: (
        sheetName: string,
        mapping: ImportCustomerMapping,
    ) => void;
}) {
    const discovered = discoverImportSources(result);
    const candidates = discovered.filter(source => source.category === category);
    return (
        <div className="mt-3 min-w-0 space-y-3">
            {result.sheets.filter(sheet => {
                const enabled = category === "orders" ? orderMappings[sheet.name]?.enabled
                    : category === "customers" ? customerMappings[sheet.name]?.enabled : productMappings[sheet.name]?.enabled;
                return enabled || candidates.some(source => source.sheetName === sheet.name);
            }).map(sheet => {
                const source = candidates.find(item => item.sheetName === sheet.name);
                const header = source?.headerRowNumber ?? sheet.rows[0]?.rowNumber ?? 1;
                const customer = customerMappings[sheet.name] ?? {
                    enabled: false, headerRowNumber: header, includeNames: true, overrides: {},
                };
                const product = productMappings[sheet.name] ?? createProductImportMapping(header);
                const order = orderMappings[sheet.name] ?? createOrderImportMapping(header);
                const enabled = category === "orders" ? order.enabled : category === "customers" ? customer.enabled : product.enabled;
                function toggle() {
                    if (category === "orders") onOrderMappingChange(sheet.name, { ...order, enabled: !enabled });
                    else if (category === "products") onProductMappingChange(sheet.name, { ...product, enabled: !enabled });
                    else onCustomerMappingChange(sheet.name, { ...customer, enabled: !enabled, includeNames: true });
                }
                return (
                    <section key={sheet.name} className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="break-words text-sm font-semibold">{sheet.name}</h3>
                                <p className="mt-1 text-xs text-text-secondary">
                                    {enabled ? "მონაცემები ამ ფურცლიდანაც გადმოვა" : "დამატებითი წყარო - ამ ეტაპზე გამოტოვებულია"}
                                </p>
                            </div>
                            <button type="button" onClick={toggle} className="min-h-10 rounded-lg border border-border px-3 text-xs">
                                {enabled ? "ამ ფურცლის გამოტოვება" : "ამ ფურცლიდანაც დამატება"}
                            </button>
                        </div>
                        {enabled && <>
                            <details className="rounded-lg bg-background p-3">
                                <summary className="cursor-pointer text-sm">ფაილის მონაცემების ნახვა</summary>
                                <div className="mt-3 max-h-64 overflow-auto">
                                    <table className="min-w-full text-left text-xs"><tbody>
                                        {sheet.rows.slice(0, 8).map(row => <tr key={row.rowNumber}>
                                            <th className="border-b border-border p-2 text-text-secondary">{row.rowNumber}</th>
                                            {row.cells.slice(0, 10).map(cell => <td key={cell.address} className="max-w-52 border-b border-border p-2 align-top">
                                                {cell.errorCode ?? cell.displayText ?? String(cell.value ?? "")}
                                            </td>)}
                                        </tr>)}
                                    </tbody></table>
                                </div>
                            </details>
                            <details className="rounded-lg border border-border p-3">
                                <summary className="cursor-pointer text-sm">სვეტების ამოცნობის შეცვლა / დამატებითი პარამეტრები</summary>
                                <div className="mt-3">
                                    {category === "orders" && <OrderColumnMapping sheet={sheet} mapping={order} onChange={mapping => onOrderMappingChange(sheet.name, mapping)} />}
                                    {category === "products" && <ProductColumnMapping sheet={sheet} mapping={product} onChange={mapping => onProductMappingChange(sheet.name, mapping)} />}
                                    {category === "customers" && <CustomerColumnMapping sheet={sheet} edits={customerEdits[sheet.name] ?? {}} onEdit={(...args) => onCustomerEdit(sheet.name, ...args)} mapping={customer} onMappingChange={mapping => onCustomerMappingChange(sheet.name, mapping)} />}
                                </div>
                            </details>
                        </>}
                    </section>
                );
            })}
        </div>
    );
}

export default function ImportWorkspace() {
    const draftSaveRef = useRef<ImportDraftSaveHandle | null>(null);
    const [step, setStep] = useState<ImportStep>("files");
    const [completedSections, setCompletedSections] = useState<ImportCategory[]>([]);
    const [orderMappings, setOrderMappings] = useState<
        Record<string, Record<string, OrderImportMapping>>
    >({});

    const [orderEdits, setOrderEdits] = useState<
        Record<string, Record<string, OrderImportEdits>>
    >({});

    const [orderGroupingConfirmations, setOrderGroupingConfirmations] =
        useState<string[]>([]);

    const [excludedOrderKeys, setExcludedOrderKeys] = useState<string[]>([]);

    const [skipOrderCustomers, setSkipOrderCustomers] = useState(false);
    const [orderCustomerDecisions, setOrderCustomerDecisions] =
        useState<OrderCustomerDecisions>({});

    const [orderOptions, setOrderOptions] = useState<OrderImportOptions>(
        createOrderImportOptions,
    );

    const ordersSelected = Object.values(orderMappings).some(
        sheets => Object.values(sheets as Record<string, { enabled: boolean }>).some(mapping => mapping.enabled),
    );
    const [productPhotoDecisions, setProductPhotoDecisions] =
        useState<ProductPhotoDecision[]>([]);
    const [productsImported, setProductsImported] = useState(false);
    const [productStockDate, setProductStockDate] =
        useState<string | null>(null);
    const [productStockPolicy, setProductStockPolicy] =
        useState<ProductStockPolicy | null>(null);
    const [productDuplicateDecisions, setProductDuplicateDecisions] =
        useState<ProductDuplicateDecision[]>([]);
    const [existingProductLinks, setExistingProductLinks] =
        useState<ImportExistingProductLinks>({});
    const [productCheckSnapshot, setProductCheckSnapshot] =
        useState<ImportProductCheckSnapshot | null>(null);
    const [excludedProductKeys, setExcludedProductKeys] =
        useState<string[]>([]);
    const [productEdits, setProductEdits] = useState<
        Record<string, Record<string, ProductImportEdits>>
    >({});
    const [productMappings, setProductMappings] = useState<
        Record<string, Record<string, ProductImportMapping>>
    >({});
    const [restoredDraft, setRestoredDraft] =
        useState<LoadedImportDraft | null>(null);
    const partialDraft = restoredDraft?.draft.status === "PARTIAL";
    const [workspaceKey, setWorkspaceKey] = useState(0);
    const [draftSaving, setDraftSaving] = useState(false);
    const [draftLoading, setDraftLoading] = useState(false);
    const [draftNotice, setDraftNotice] = useState("");
    const [customerCheckSnapshot, setCustomerCheckSnapshot] =
        useState<ImportCustomerCheckSnapshot | null>(null);
    const [existingCustomerLinks, setExistingCustomerLinks] =
        useState<ImportExistingCustomerLinks>({});
    const [excludedCustomerKeys, setExcludedCustomerKeys] =
        useState<string[]>([]);
    const [customerMappings, setCustomerMappings] = useState<
        Record<string, Record<string, ImportCustomerMapping>>
    >({});
    const [customerEdits, setCustomerEdits] = useState<
        Record<string, Record<string, ImportCustomerEdits>>
    >({});
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [busy, setBusy] = useState(false);

    const running = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const hashes = useRef(new Set<string>());

    useEffect(() => {
        return () => controller.current?.abort();
    }, []);

    function update(id: string, patch: Partial<FileEntry>) {
        setEntries(current =>
            current.map(entry =>
                entry.id === id ? { ...entry, ...patch } : entry,
            ),
        );
    }

    async function selectFiles(files: File[]) {
        if (
            running.current ||
            draftSaving ||
            draftLoading ||
            productsImported ||
            completedSections.length > 0 ||
            partialDraft ||
            !files.length
        ) return;

        running.current = true;
        setBusy(true);

        const abort = new AbortController();
        controller.current = abort;

        const selected = files.map(file => ({
            id: crypto.randomUUID(),
            file,
        }));

        setEntries(current => [
            ...current,
            ...selected.map(({ id, file }): FileEntry => ({
                id,
                name: file.name,
                state: "WAITING",
                result: null,
                error: "",
            })),
        ]);

        try {
            for (const { id, file } of selected) {
                if (abort.signal.aborted) break;

                try {
                    let photoResult: ImportPhotoReadResult = {
                        photos: [],
                        issues: [],
                    };

                    const result = await readImportFile(file, {
                        signal: abort.signal,
                        onStage: (stage: ImportReadStage) =>
                            update(id, { state: stage }),
                        onPhotos: received => {
                            photoResult = received;
                        },
                    });

                    if (abort.signal.aborted) break;

                    if (hashes.current.has(result.sha256)) {
                        update(id, {
                            state: "ERROR",
                            error:
                                "ეს ფაილი უკვე დამატებულია - შიგთავსი იდენტურია.",
                        });
                        continue;
                    }

                    const photoManifest =
                        createImportPhotoManifest(photoResult);

                    const prepared = await prepareImportPhotos(
                        photoResult.photos,
                        {
                            signal: abort.signal,
                            onProgress: (completed, total) => {
                                if (abort.signal.aborted) return;

                                update(id, {
                                    state: "PARSING",
                                    photoProgress: {
                                        completed,
                                        total,
                                    },
                                });
                            },
                        },
                    );

                    if (abort.signal.aborted) break;

                    // პრევიუშიც შემცირებულ ფოტოებს ვიყენებთ.
                    // დიდი ორიგინალები გვერდის მდგომარეობაში აღარ ინახება.
                    const preparedPhotoResult: ImportPhotoReadResult = {
                        photos: prepared.photos.map(photo => ({
                            sourcePath: photo.sourcePath,
                            sheetName: photo.sheetName,
                            rowNumber: photo.rowNumber,
                            columnNumber: photo.columnNumber,
                            originalName: photo.file.name,
                            mimeType: photo.file.type,
                            blob: photo.file,
                        })),
                        issues: [
                            ...photoResult.issues,
                            ...prepared.issues,
                        ],
                    };

                    hashes.current.add(result.sha256);
                    const automatic = createDiscoveredMappings(result);
                    setCustomerMappings(current => ({ ...current, [id]: automatic.customers }));
                    setProductMappings(current => ({ ...current, [id]: automatic.products }));
                    setOrderMappings(current => ({ ...current, [id]: automatic.orders }));

                    update(id, {
                        state: "READY",
                        result,
                        photoResult: preparedPhotoResult,
                        photoManifest,
                        preparedPhotos: prepared.photos,
                        photoProgress: undefined,
                    });
                } catch (cause: unknown) {
                    if (abort.signal.aborted) break;

                    update(id, {
                        state: "ERROR",
                        error:
                            cause instanceof Error
                                ? cause.message
                                : "ფაილი ვერ წაიკითხა.",
                    });
                }
            }
        } finally {
            if (abort.signal.aborted) {
                const ids = new Set(
                    selected.map(item => item.id),
                );

                setEntries(current =>
                    current.map(entry =>
                        ids.has(entry.id) &&
                            ["WAITING", "READING", "PARSING"].includes(
                                entry.state,
                            )
                            ? {
                                ...entry,
                                state: "ERROR",
                                error: "ფაილის წაკითხვა გაუქმებულია.",
                            }
                            : entry,
                    ),
                );
            }

            controller.current = null;
            running.current = false;
            setBusy(false);
        }
    }

    const labels: Record<FileEntry["state"], string> = {
        WAITING: "რიგშია",
        READING: "იკითხება…",
        PARSING: "მუშავდება…",
        READY: "წაკითხულია",
        ERROR: "ვერ დამუშავდა",
    };

    const discovery = useMemo(() => entries.flatMap(entry => entry.result
        ? discoverImportSources(entry.result).map(source => ({ ...source, fileId: entry.id, fileName: entry.name })) : []), [entries]);
    const unrecognizedSheets = entries.flatMap(entry => entry.result ? entry.result.sheets.filter(sheet =>
        !discovery.some(source => source.fileId === entry.id && source.sheetName === sheet.name)
    ).map(sheet => ({ fileId: entry.id, fileName: entry.name, sheet })) : []);
    function assignSource(category: ImportCategory, fileId: string, sheet: ParsedImportFile["sheets"][number]) {
        const header = sheet.rows[0]?.rowNumber ?? 1;
        if (category === "orders") setOrderMappings(current => ({ ...current, [fileId]: { ...current[fileId], [sheet.name]: { ...createOrderImportMapping(header), ...current[fileId]?.[sheet.name], enabled: true } } }));
        if (category === "products") setProductMappings(current => ({ ...current, [fileId]: { ...current[fileId], [sheet.name]: { ...createProductImportMapping(header), ...current[fileId]?.[sheet.name], enabled: true } } }));
        if (category === "customers") { setSkipOrderCustomers(false); setCustomerMappings(current => ({ ...current, [fileId]: { ...current[fileId], [sheet.name]: { ...(current[fileId]?.[sheet.name] ?? { headerRowNumber: header, includeNames: true, overrides: {}, enabled: false }), enabled: true } } })); }
        moveTo(category);
    }
    const categoryMappings = { orders: orderMappings, customers: customerMappings, products: productMappings };
    const selectedCategories = IMPORT_CATEGORY_ORDER.filter(category => Object.values(categoryMappings[category]).some(sheets => Object.values(sheets as Record<string, { enabled: boolean }>).some(mapping => mapping.enabled)));
    const availableCategories = IMPORT_CATEGORY_ORDER.filter(category => selectedCategories.includes(category) || discovery.some(source => source.category === category));
    const editableCategories = availableCategories.filter(category => !completedSections.includes(category));
    const steps: ImportStep[] = ["files", ...editableCategories, "review"];
    const nextStep = steps[steps.indexOf(step) + 1] ?? "review";
    const nextStepLabel = nextStep === "review" ? "შეჯამება და შენახვა" : `შემდეგი: ${IMPORT_CATEGORY_LABELS[nextStep as ImportCategory]}`;
    function moveTo(next: ImportStep) {
        setStep(next);
        document.getElementById("import-wizard-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const productStockDateReview = useMemo(() => {
        const sources = entries.flatMap(entry => entry.result ? entry.result.sheets.flatMap(sheet => {
            const mapping = productMappings[entry.id]?.[sheet.name];
            return mapping?.enabled ? [{ fileId: entry.id, fileName: entry.name, sheet, mapping, edits: productEdits[entry.id]?.[sheet.name] ?? {} }] : [];
        }) : []);
        const prepared = prepareImportProducts(sources, excludedProductKeys);
        const resolved = resolveImportProductDuplicates({ records: prepared.records, decisions: productDuplicateDecisions });
        return getProductStockDateReview(buildProductImportPlan({ records: resolved.records, snapshot: productCheckSnapshot, decisions: existingProductLinks, stockPolicy: productStockPolicy, stockDate: productStockDate }), productStockDate, productStockPolicy);
    }, [entries, productMappings, productEdits, excludedProductKeys, productDuplicateDecisions, productCheckSnapshot, existingProductLinks, productStockPolicy, productStockDate]);
    const productDateBlocked = !completedSections.includes("products") && productStockDateReview.error !== null;
    function goNext() {
        if (step === "products" && productDateBlocked) {
            document.getElementById("import-stock-date")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        moveTo(nextStep);
    }
    function goBack() { moveTo(steps[Math.max(0, steps.indexOf(step) - 1)] ?? "files"); }
    function skipCategory(category: ImportCategory) {
        const disable = <T extends { enabled: boolean },>(current: Record<string, Record<string, T>>) => Object.fromEntries(Object.entries(current).map(([id, sheets]) => [id, Object.fromEntries(Object.entries(sheets).map(([name, mapping]) => [name, { ...mapping, enabled: false }]))]));
        if (category === "orders") setOrderMappings(disable);
        if (category === "customers") {
            setCustomerMappings(disable);
            setSkipOrderCustomers(true);
        }
        if (category === "products") setProductMappings(disable);
        // Skipping is explicit: do not validate the old render's category data.
        moveTo(nextStep);
    }

    const importSettings: ImportDraftSettings = {
        ...restoredDraft?.settings,
        workspaceVersion: 1,
        orderMappings,
        orderOptions,
        orderEdits,
        orderGroupingConfirmations,
        excludedOrderKeys,
        orderCustomerDecisions,
        skipOrderCustomers,
        productPhotoDecisions,
        productDuplicateDecisions,
        productStockPolicy,
        productStockDate,
        productMappings,
        productEdits,
        customerMappings,
        customerEdits,
        excludedCustomerKeys,
        excludedProductKeys,
        existingCustomerLinks,
        existingProductLinks,
    };

    function startNewImport() {
        hashes.current.clear();
        setEntries([]);
        setStep("files");
        setCompletedSections([]);
        setCustomerEdits({});
        setCustomerMappings({});
        setProductMappings({});
        setOrderMappings({});
        setOrderCustomerDecisions({});
        setSkipOrderCustomers(false);
        setOrderOptions(createOrderImportOptions());
        setOrderEdits({});
        setOrderGroupingConfirmations([]);
        setExcludedOrderKeys([]);
        setProductEdits({});
        setExcludedCustomerKeys([]);
        setExcludedProductKeys([]);
        setExistingCustomerLinks({});
        setExistingProductLinks({});
        setProductDuplicateDecisions([]);
        setProductPhotoDecisions([]);
        setProductStockPolicy(null);
        setProductStockDate(null);
        setCustomerCheckSnapshot(null);
        setProductCheckSnapshot(null);
        setRestoredDraft(null);
        setProductsImported(false);
        setWorkspaceKey(current => current + 1);
        setDraftNotice("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (productsImported) {
        return (
            <main className="mx-auto w-full max-w-3xl p-4 text-text-primary sm:p-6">
                <section role="status" aria-live="polite" className="space-y-5 rounded-2xl border border-border bg-surface px-5 py-10 text-center sm:p-12">
                    <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-9">
                            <circle cx="12" cy="12" r="9" />
                            <path d="m8 12 2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-xl font-semibold sm:text-2xl">იმპორტი წარმატებით დასრულდა</h1>
                        <p className="text-sm text-text-secondary">არჩეული მონაცემები შენახულია MARTEO-ში.</p>
                    </div>
                    <button type="button" onClick={startNewImport} className="min-h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-white">ახალი იმპორტის დაწყება</button>
                </section>
            </main>
        );
    }

    return (
        <main className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 text-text-primary sm:p-6">
            <div id="import-wizard-heading" className="scroll-mt-28">
                <h1 className="text-2xl font-semibold">
                    მონაცემების იმპორტი
                </h1>

                <p className="mt-2 text-sm text-text-secondary">
                    ატვირთე ფაილები - MARTEO თავად იპოვის შეკვეთებს,
                    მომხმარებლებსა და პროდუქტებს. თითოეულ ეტაპს ცალ-ცალკე გაივლი.
                </p>
            </div>

            <nav aria-label="იმპორტის ნაბიჯები" className="flex flex-wrap gap-2">
                {steps.map((item, index) => <button key={item} type="button" disabled={draftSaving || busy || (item !== "files" && availableCategories.length === 0)} aria-current={step === item ? "step" : undefined} onClick={() => moveTo(item)} className={`min-h-10 rounded-xl border px-3 text-sm disabled:opacity-40 ${step === item ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border text-text-secondary"}`}>
                    {index + 1}. {item === "files" ? "ფაილები" : item === "review" ? "გადმოტანა" : IMPORT_CATEGORY_LABELS[item]}
                </button>)}
            </nav>

            <section hidden={step !== "files"} className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                    <label className={[
                        "relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-xl bg-accent px-4 text-sm font-semibold text-white",
                        busy ? "opacity-50" : "cursor-pointer",
                    ].join(" ")}>
                        ფაილების არჩევა

                        <input
                            type="file"
                            multiple
                            accept=".xlsx,.csv,.numbers"
                            disabled={busy || draftSaving || draftLoading || productsImported || partialDraft || completedSections.length > 0}
                            aria-label="იმპორტის ფაილების არჩევა"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={event => {
                                const files = Array.from(
                                    event.currentTarget.files ?? [],
                                );
                                event.currentTarget.value = "";
                                void selectFiles(files);
                            }}
                        />
                    </label>

                    {busy && (
                        <button
                            type="button"
                            onClick={() =>
                                controller.current?.abort()
                            }
                            className="min-h-11 rounded-xl border border-border px-4 text-sm"
                        >
                            შეჩერება
                        </button>
                    )}

                    {!busy && !draftSaving && !draftLoading && entries.length > 0 && (
                        <button
                            type="button"
                            onClick={startNewImport}
                            className="min-h-11 rounded-xl border border-border px-4 text-sm"
                        >
                            სიის გასუფთავება
                        </button>
                    )}
                </div>

                <p className="mt-3 text-xs text-text-secondary">
                    Excel (.xlsx), CSV ან Apple Numbers. შეგიძლია რამდენიმე ფაილი დაამატო.
                    საბოლოო დადასტურებამდე მონაცემები ბიზნესში არ დაემატება.
                </p>


                {entries.length > 0 && <div className="space-y-2">
                    {entries.map(entry => <div key={entry.id} className="rounded-xl border border-border p-3 text-sm">
                        <p className="break-all font-medium">{entry.name}</p>
                        <p className={entry.error ? "mt-1 text-danger" : "mt-1 text-text-secondary"}>{entry.error || labels[entry.state]}</p>
                        {entry.result && entry.result.issues.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-danger">ფაილში აღმოჩენილი საკითხები ({entry.result.issues.length})</summary><ImportSourceIssues result={entry.result} /></details>}
                    </div>)}
                </div>}
                {discovery.length > 0 && <div className="space-y-3">
                    <h2 className="font-semibold">ფაილებში აღმოჩენილი მონაცემები</h2>
                    <p className="text-sm text-text-secondary">კატეგორიებსა და სვეტებს MARTEO თავად ამოიცნობს. არასრულ ჩანაწერებს შემდეგ ეტაპზე შეავსებ ან გამოტოვებ. ერთი ფურცელი რამდენიმე კატეგორიის წყაროც შეიძლება იყოს.</p>
                    {IMPORT_CATEGORY_ORDER.filter(category => availableCategories.includes(category)).map(category => <div key={category} className="rounded-xl border border-border p-4">
                        <p className="font-semibold">{IMPORT_CATEGORY_LABELS[category]}</p>
                        <div className="mt-2 space-y-2 text-sm text-text-secondary">{discovery.filter(source => source.category === category).map(source => <p key={JSON.stringify([source.fileId, source.sheetName])} className="break-words">
                            {source.fileName} / {source.sheetName} · {source.rowCount} რიგი
                            {source.missing.length > 0 ? ` - დასამატებელი ან დასაკავშირებელია: ${source.missing.join(", ")}` : " - ძირითადი სვეტები ამოცნობილია"}
                            {!source.suggested && " · დამატებითი წყარო"}
                        </p>)}</div>
                    </div>)}
                    <p className="text-xs text-text-secondary">ამოცნობა ჯერ არ ნიშნავს შენახვას. თარიღებს, თანხებსა და თითოეული ჩანაწერის სისწორეს შემდეგ ეტაპებზე გადავამოწმებთ.</p>
                </div>}
                {unrecognizedSheets.length > 0 && <details className="space-y-3 rounded-xl border border-border p-4 text-sm">
                    <summary className="cursor-pointer">სხვა ფურცლები ({unrecognizedSheets.length})</summary>
                    <p className="mt-3 text-text-secondary">ქვემოთ ჩამოთვლილი ფურცლები ავტომატურად არ დაგვიმატებია. თუ მათშიც გადმოსატანი მონაცემებია, მიუთითე კატეგორია; სხვა შემთხვევაში არაფრის გაკეთება არ გჭირდება.</p>
                    {unrecognizedSheets.map(({ fileId, fileName, sheet }) => <div key={JSON.stringify([fileId, sheet.name])} className="space-y-2 rounded-lg border border-border p-3">
                        <p className="break-words font-medium">{fileName} / {sheet.name}</p>
                        {/პარტი|შესყიდვ|purchase|procurement|batch/i.test(sheet.name) ? <p className="text-text-secondary">შესყიდვების/პარტიების ისტორია ამ იმპორტში არ გადმოდის.</p>
                        : <div className="flex flex-wrap gap-2">{IMPORT_CATEGORY_ORDER.map(category => <button key={category} type="button" disabled={draftSaving || busy || completedSections.length > 0} onClick={() => assignSource(category, fileId, sheet)} className="min-h-10 rounded-lg border border-border px-3">{IMPORT_CATEGORY_LABELS[category]}</button>)}</div>}
                    </div>)}
                </details>}
                {availableCategories.length > 0 && <button type="button" disabled={busy || draftSaving || draftLoading} onClick={goNext} className="min-h-12 w-full rounded-xl bg-accent px-5 font-semibold text-white sm:w-auto">ამოცნობილი მონაცემების გასწორება</button>}

            </section>

            <details className="rounded-xl border border-border bg-surface p-3">
                <summary className="cursor-pointer text-sm">შენახული იმპორტის გაგრძელება</summary>
            <ImportDraftPicker
                disabled={busy || draftSaving}
                onLoadingChange={setDraftLoading}
                onOpen={loaded => {
                    hashes.current = new Set(
                        loaded.files.map(item => item.file.sha256),
                    );

                    setEntries(
                        loaded.files.map((item): FileEntry => ({
                            id: item.clientFileId,
                            name: item.file.originalName,
                            state: "READY",
                            result: item.file,
                            savedPhotos: item.photos,
                            photoManifest: item.photoManifest,
                            error: "",
                        })),
                    );

                    setStep(loaded.draft.status === "PARTIAL" ? "review" : "files");
                    setCompletedSections(IMPORT_CATEGORY_ORDER.filter(category => loaded.completedSections[category]));
                    const automatic = loaded.files.map(item => ({ id: item.clientFileId, mappings: createDiscoveredMappings(item.file) }));
                    setCustomerMappings(loaded.hasSavedSettings ? loaded.settings.customerMappings : Object.fromEntries(automatic.map(item => [item.id, item.mappings.customers])));
                    setProductMappings(loaded.hasSavedSettings ? loaded.settings.productMappings : Object.fromEntries(automatic.map(item => [item.id, item.mappings.products])));
                    setOrderMappings(loaded.hasSavedSettings ? loaded.settings.orderMappings ?? {} : Object.fromEntries(automatic.map(item => [item.id, item.mappings.orders])));
                    setOrderOptions(
                        loaded.settings.orderOptions ??
                        createOrderImportOptions(),
                    );
                    setOrderEdits(loaded.settings.orderEdits ?? {});
                    setOrderCustomerDecisions(
                        loaded.settings.orderCustomerDecisions ?? {},
                    );
                    setSkipOrderCustomers(loaded.settings.skipOrderCustomers === true);
                    setExcludedOrderKeys(
                        loaded.settings.excludedOrderKeys ?? [],
                    );
                    setOrderGroupingConfirmations(
                        loaded.settings.orderGroupingConfirmations ?? [],
                    );
                    setProductEdits(loaded.settings.productEdits);
                    setExcludedProductKeys(loaded.settings.excludedProductKeys);
                    setCustomerEdits(loaded.settings.customerEdits);
                    setExcludedCustomerKeys(
                        loaded.settings.excludedCustomerKeys,
                    );
                    setExistingCustomerLinks(
                        loaded.settings.existingCustomerLinks,
                    );
                    setExistingProductLinks(loaded.settings.existingProductLinks);
                    setProductStockPolicy(
                        loaded.settings.productStockPolicy,
                    );
                    setProductStockDate(
                        loaded.settings.productStockDate,
                    );
                    setProductPhotoDecisions(
                        loaded.settings.productPhotoDecisions ?? [],
                    );
                    setProductDuplicateDecisions(
                        loaded.settings.productDuplicateDecisions ?? [],
                    );
                    setCustomerCheckSnapshot(null);
                    setProductCheckSnapshot(null);
                    setRestoredDraft(loaded);
                    setProductsImported(false);
                    setWorkspaceKey(current => current + 1);

                    setDraftNotice(
                        loaded.hasSavedSettings
                            ? "მონახაზი გახსნილია. შენახული შესწორებები და არჩევანები აღდგენილია."
                            : "ფაილები აღდგენილია, თუმცა ამ მონახაზში პარამეტრების შენახვა დასრულებული არ ყოფილა. არჩევანი ხელახლა გადაამოწმე.",
                    );
                }}
            />
            </details>

            {draftNotice && (
                <p role="status" className="text-sm text-text-secondary">
                    {draftNotice}
                </p>
            )}

            {partialDraft && (
                <p role="status" className="text-sm text-text-secondary">
                    ამ მონახაზის ნაწილი უკვე შენახულია.
                    შეგიძლია გააგრძელო დარჩენილი განყოფილებების იმპორტი.
                    დასრულებული კატეგორიები აღარ განმეორდება.
                    დარჩენილ კატეგორიებზე დაბრუნება და შესწორება შეგიძლია ზედა ნაბიჯებიდან.
                </p>
            )}


            {step !== "files" && step !== "review" && <div className="space-y-2">
                <h2 className="text-xl font-semibold">{IMPORT_CATEGORY_LABELS[step]}</h2>
                <p className="text-sm text-text-secondary">სწორად შევსებული მონაცემები მზადაა. გაასწორე მხოლოდ მონიშნული ველები ან გამოტოვე არასასურველი ჩანაწერები. ცვლილების გამოყენების შემდეგ შედეგი ავტომატურად განახლდება.</p>
                {step === "orders" && <p className="text-xs text-text-secondary">გადმოდის ძველი შეკვეთების ისტორია. მიმდინარე მარაგს არ შევცვლით.</p>}
            </div>}
            <fieldset
                disabled={draftSaving || productsImported}
                hidden={step === "files" || step === "review" || productsImported}
                className="min-w-0 space-y-5 border-0 p-0"
            >
                {entries.filter(entry => entry.result && (
                    step === "orders" ? Object.values(orderMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === step)
                    : step === "customers" ? Object.values(customerMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === step)
                    : Object.values(productMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === step)
                )).map(entry => (
                    <section
                        key={`${workspaceKey}:${entry.id}`}
                        className="min-w-0 rounded-2xl border border-border bg-surface p-4"
                    >
                        <h2 className="break-all font-semibold">
                            {entry.name}
                        </h2>

                        <p
                            role="status"
                            className="mt-1 text-sm text-text-secondary"
                        >
                            {entry.state === "PARSING" &&
                                entry.photoProgress &&
                                entry.photoProgress.total > 0
                                ? `ფოტოები მზადდება: ${entry.photoProgress.completed} / ${entry.photoProgress.total}`
                                : labels[entry.state]}
                        </p>

                        {entry.error && (
                            <p
                                role="alert"
                                className="mt-2 text-sm text-danger"
                            >
                                {entry.error}
                            </p>
                        )}

                        {step === "products" && entry.state === "READY" &&
                            entry.result &&
                            Object.values(
                                productMappings[entry.id] ?? {},
                            ).some(mapping => mapping.enabled) && (
                                <ImportFilePhotoChoice
                                    clientFileId={entry.id}
                                    sha256={entry.result.sha256}
                                    decisions={productPhotoDecisions}
                                    onChange={setProductPhotoDecisions}
                                />
                            )}

                        {step === "products" && entry.state === "READY" && entry.result && (
                            <ImportRowPhotoChoices
                                clientFileId={entry.id}
                                file={entry.result}
                                mappings={
                                    productMappings[entry.id] ?? {}
                                }
                                edits={productEdits[entry.id] ?? {}}
                                excludedKeys={excludedProductKeys}
                                manifest={entry.photoManifest ?? null}
                                preparedPhotos={entry.preparedPhotos}
                                savedPhotos={entry.savedPhotos}
                                decisions={productPhotoDecisions}
                                onChange={setProductPhotoDecisions}
                            />
                        )}

                        {step === "products" && entry.state === "READY" &&
                            entry.savedPhotos &&
                            entry.savedPhotos.length > 0 && (
                                <ImportSavedPhotoPreview
                                    photos={entry.savedPhotos}
                                />
                            )}
                        {step === "products" && entry.state === "READY" && entry.photoResult && (
                            <div className="mt-3 space-y-2 text-sm">
                                {entry.photoResult.photos.length > 0 && (
                                    <p className="text-text-secondary">
                                        მომზადებულია{" "}
                                        {entry.photoResult.photos.length} ფოტო.
                                        ფოტოები შემცირებულია და
                                        ატვირთვისთვის მზადაა.
                                        ბაზაში ჯერ არ შენახულა.
                                    </p>
                                )}

                                {entry.photoResult.photos.length > 0 && (
                                    <details className="rounded-xl border border-border p-3">
                                        <summary className="cursor-pointer">
                                            ამოღებული ფოტოების ნახვა
                                        </summary>

                                        <div className="mt-3">
                                            <ImportEmbeddedPhotoPreview
                                                photos={entry.photoResult.photos}
                                            />
                                        </div>
                                    </details>
                                )}

                                {entry.photoResult.issues.length > 0 && (
                                    <details className="rounded-xl border border-danger/40 p-3">
                                        <summary className="cursor-pointer text-danger">
                                            ფოტოების გადასამოწმებელი საკითხები
                                            {" "}({entry.photoResult.issues.length})
                                        </summary>

                                        <ul className="mt-3 space-y-2">
                                            {entry.photoResult.issues.map(
                                                (issue, index) => (
                                                    <li key={index}>
                                                        {issue.sheetName && (
                                                            <span className="font-semibold">
                                                                {issue.sheetName}
                                                                {issue.rowNumber !== null
                                                                    ? ` - რიგი ${issue.rowNumber}`
                                                                    : ""}
                                                                {": "}
                                                            </span>
                                                        )}
                                                        {issue.message}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        )}

                        {entry.result && (
                            <FilePreview
                                category={step === "customers" || step === "products" ? step : "orders"}
                                result={entry.result}
                                orderMappings={orderMappings[entry.id] ?? {}}
                                onOrderMappingChange={(sheetName, mapping) => {
                                    setOrderMappings(current => ({
                                        ...current,
                                        [entry.id]: {
                                            ...current[entry.id],
                                            [sheetName]: mapping,
                                        },
                                    }));
                                }}
                                productMappings={productMappings[entry.id] ?? {}}
                                onProductMappingChange={(sheetName, mapping) => {
                                    setProductMappings(current => ({
                                        ...current,
                                        [entry.id]: {
                                            ...current[entry.id],
                                            [sheetName]: mapping,
                                        },
                                    }));
                                }}
                                customerMappings={customerMappings[entry.id] ?? {}}
                                onCustomerMappingChange={(sheetName, mapping) => {
                                    if (mapping.enabled) setSkipOrderCustomers(false);
                                    setCustomerMappings(current => ({
                                        ...current,
                                        [entry.id]: {
                                            ...current[entry.id],
                                            [sheetName]: mapping,
                                        },
                                    }));
                                }}
                                customerEdits={customerEdits[entry.id] ?? {}}
                                onCustomerEdit={(
                                    sheetName,
                                    rowNumber,
                                    field,
                                    value,
                                ) => {
                                    setCustomerEdits(current => ({
                                        ...current,
                                        [entry.id]: {
                                            ...current[entry.id],
                                            [sheetName]: {
                                                ...current[entry.id]?.[sheetName],
                                                [rowNumber]: {
                                                    ...current[entry.id]?.[sheetName]?.[rowNumber],
                                                    [field]: value,
                                                },
                                            },
                                        },
                                    }));
                                }}
                            />
                        )}
                    </section>
                ))}

                {step === "orders" && ordersSelected && (
                    <>
                        <OrderImportOptionsPicker
                            needs={getOrderImportNeeds(entries.flatMap(entry => entry.result ? [{ clientFileId: entry.id, file: entry.result }] : []), importSettings)}
                            value={orderOptions}
                            onChange={setOrderOptions}
                        />

                        <ImportOrdersSummary
                            autoReview
                            continueDisabled={
                                busy ||
                                draftSaving ||
                                draftLoading ||
                                productsImported
                            }
                            onContinue={goNext}
                            onOrderCustomerDecisionChange={(phone, decision) => {
                                setOrderCustomerDecisions(current => {
                                    const next = { ...current };

                                    if (decision === null) {
                                        delete next[phone];
                                    } else {
                                        next[phone] = decision;
                                    }

                                    return next;
                                });
                            }}
                            onExcludedRowsChange={(keys, excluded) => {
                                const selectedKeys = new Set(keys);

                                setExcludedOrderKeys(current =>
                                    excluded
                                        ? [...new Set([...current, ...keys])]
                                        : current.filter(
                                            key => !selectedKeys.has(key),
                                        ),
                                );
                            }}
                            onGroupingConfirmationChange={(token, confirmed) => {
                                setOrderGroupingConfirmations(current =>
                                    confirmed
                                        ? [...new Set([...current, token])]
                                        : current.filter(item => item !== token),
                                );
                            }}
                            onRowEdit={(row, edits) => {
                                setOrderEdits(current => ({
                                    ...current,
                                    [row.fileId]: {
                                        ...current[row.fileId],
                                        [row.sheetName]: {
                                            ...current[row.fileId]?.[row.sheetName],
                                            [row.rowNumber]: {
                                                ...current[row.fileId]?.[row.sheetName]?.[row.rowNumber],
                                                ...edits,
                                            },
                                        },
                                    },
                                }));
                            }}
                            files={entries.flatMap(entry =>
                                entry.state === "READY" && entry.result
                                    ? [{
                                        clientFileId: entry.id,
                                        file: entry.result,
                                    }]
                                    : [],
                            )}
                            settings={importSettings}
                        />
                    </>
                )}

                <div hidden={step !== "customers"}>
                <ImportCustomersSummary
                    autoReview
                    onEdit={(fileId, sheetName, rowNumber, changes) => {
                        setCustomerEdits(current => ({ ...current, [fileId]: { ...current[fileId], [sheetName]: { ...current[fileId]?.[sheetName], [rowNumber]: { ...current[fileId]?.[sheetName]?.[rowNumber], ...changes } } } }));
                    }}
                    onDisableSource={(fileId, sheetName) => {
                        setCustomerMappings(current => {
                            const mapping = current[fileId]?.[sheetName];

                            if (!mapping) return current;

                            return {
                                ...current,
                                [fileId]: {
                                    ...current[fileId],
                                    [sheetName]: {
                                        ...mapping,
                                        enabled: false,
                                    },
                                },
                            };
                        });
                    }}
                    customerCheckSnapshot={customerCheckSnapshot}
                    onCustomersChecked={setCustomerCheckSnapshot}
                    existingLinks={existingCustomerLinks}
                    onExistingLinkChange={(phone, link) => {
                        setExistingCustomerLinks(current => ({
                            ...current,
                            [phone]: link,
                        }));
                    }}
                    excludedKeys={excludedCustomerKeys}
                    onExcludedChange={setExcludedCustomerKeys}
                    onPhoneChange={(fileId, sheetName, rowNumber, phone) => {
                        setCustomerEdits(current => ({
                            ...current,
                            [fileId]: {
                                ...current[fileId],
                                [sheetName]: {
                                    ...current[fileId]?.[sheetName],
                                    [rowNumber]: {
                                        ...current[fileId]?.[sheetName]?.[rowNumber],
                                        phone,
                                    },
                                },
                            },
                        }));
                    }}
                    sources={entries.flatMap(entry => {
                        if (!entry.result) return [];

                        return entry.result.sheets.flatMap(sheet => {
                            const mapping =
                                customerMappings[entry.id]?.[sheet.name];

                            if (!mapping?.enabled) return [];

                            return [{
                                fileId: entry.id,
                                fileName: entry.name,
                                sheet,
                                mapping,
                                edits:
                                    customerEdits[entry.id]?.[sheet.name] ?? {},
                            }];
                        });
                    })}
                />
                </div>
                <div hidden={step !== "products"}>
                <ImportProductsSummary
                    autoReview
                    stockDate={productStockDate}
                    onStockDateChange={setProductStockDate}
                    stockPolicy={productStockPolicy}
                    onStockPolicyChange={setProductStockPolicy}
                    duplicateDecisions={productDuplicateDecisions}
                    onDuplicateDecisionsChange={setProductDuplicateDecisions}
                    productCheckSnapshot={productCheckSnapshot}
                    existingLinks={existingProductLinks}
                    onExistingLinkChange={(key, link) => {
                        setExistingProductLinks(current => ({
                            ...current,
                            [key]: link,
                        }));
                    }}
                    onProductsChecked={setProductCheckSnapshot}
                    excludedKeys={excludedProductKeys}
                    onExcludedChange={setExcludedProductKeys}
                    onDisableSource={(fileId, sheetName) => {
                        setProductMappings(current => {
                            const mapping = current[fileId]?.[sheetName];

                            if (!mapping) return current;

                            return {
                                ...current,
                                [fileId]: {
                                    ...current[fileId],
                                    [sheetName]: {
                                        ...mapping,
                                        enabled: false,
                                    },
                                },
                            };
                        });
                    }}
                    onEdit={(fileId, sheetName, rowNumber, changes) => {
                        setProductEdits(current => ({
                            ...current,
                            [fileId]: {
                                ...current[fileId],
                                [sheetName]: {
                                    ...current[fileId]?.[sheetName],
                                    [rowNumber]: {
                                        ...current[fileId]?.[sheetName]?.[rowNumber],
                                        ...changes,
                                    },
                                },
                            },
                        }));
                    }}
                    sources={entries.flatMap(entry => {
                        if (!entry.result) return [];

                        return entry.result.sheets.flatMap(sheet => {
                            const mapping =
                                productMappings[entry.id]?.[sheet.name];

                            if (!mapping?.enabled) return [];

                            return [{
                                fileId: entry.id,
                                fileName: entry.name,
                                sheet,
                                mapping,
                                edits: productEdits[entry.id]?.[sheet.name] ?? {},
                            }];
                        });
                    })}
                />
                </div>
            </fieldset>

            {step !== "files" && step !== "review" && !productsImported && (
                <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface p-4 shadow-lg sm:mx-0 sm:rounded-xl sm:border">
                    <button type="button" disabled={draftSaving} onClick={goBack} className="min-h-11 rounded-xl border border-border px-4 text-sm">უკან</button>
                    <div className="flex flex-wrap gap-2">
                        {step === "products" && productDateBlocked && <p role="alert" className="w-full text-sm text-danger">{productStockDateReview.error}</p>}
                        {!completedSections.includes(step) && <button type="button" disabled={draftSaving} onClick={() => skipCategory(step)} className="min-h-11 rounded-xl border border-border px-4 text-sm">ამ კატეგორიის გამოტოვება</button>}
                        <button type="button" disabled={draftSaving} onClick={goNext} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white">{nextStepLabel}</button>
                    </div>
                </div>
            )}

            <section hidden={step !== "review"} className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
                <h2 className="text-lg font-semibold">მონაცემების გადმოტანა MARTEO-ში</h2>
                <p className="text-sm text-text-secondary">შეინახე მომზადებული მონაცემები, შემდეგ გადაამოწმე და დაადასტურე თითოეული კატეგორიის გადმოტანა. ღილაკები ამავე ბლოკში გამოჩნდება.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                    {IMPORT_CATEGORY_ORDER.map(category => <div key={category} className="rounded-xl border border-border p-3 text-sm">
                        <p className="font-semibold">{IMPORT_CATEGORY_LABELS[category]}</p>
                        <p className="mt-1 text-text-secondary">{completedSections.includes(category) ? "გადმოტანილია" : selectedCategories.includes(category) ? "მონიშნულია გადმოსატანად" : "გამოტოვებულია"}</p>
                    </div>)}
                </div>
                {selectedCategories.length === 0 && <p role="status" className="text-sm text-text-secondary">ყველა კატეგორია გამოტოვებულია. გადასატანად დაბრუნდი შესაბამის ნაბიჯზე და დაამატე სასურველი წყარო.</p>}
                {!productsImported && <button type="button" disabled={draftSaving} onClick={goBack} className="min-h-11 rounded-xl border border-border px-4 text-sm">მონაცემებთან დაბრუნება</button>}
                {productDateBlocked && <div role="alert" className="space-y-2 rounded-xl border border-danger/60 p-3 text-sm text-danger">
                    <p>{productStockDateReview.error}</p>
                    <button type="button" onClick={() => moveTo("products")} className="min-h-11 rounded-xl border border-danger/60 px-4">მარაგის თარიღის შევსება</button>
                </div>}
                {entries.some(entry => entry.result !== null) && (
                    <ImportDraftSaveButton
                        saveRef={draftSaveRef}
                        key={workspaceKey}
                        disabled={busy || draftLoading || productDateBlocked}
                        initialDraft={restoredDraft}
                        onSavingChange={setDraftSaving}
                        onReviewCategory={moveTo}
                        completedSections={completedSections}
                        onSectionImported={(category, allDone) => {
                            setCompletedSections(current => [...new Set([...current, category])]);
                            setProductsImported(allDone);
                            if (allDone) window.scrollTo({ top: 0, behavior: "smooth" });
                            setDraftNotice(allDone ? "მონიშნული მონაცემების გადმოტანა დასრულებულია." : "განყოფილება შენახულია. გააგრძელე შემდეგით.");
                        }}
                        files={entries.flatMap(entry =>
                            entry.result
                                ? [{
                                    clientFileId: entry.id,
                                    file: entry.result,
                                    photoManifest:
                                        entry.photoManifest ?? null,
                                    photos: (
                                        entry.preparedPhotos ?? []
                                    ).filter(photo => {
                                        const mapping =
                                            productMappings[entry.id]?.[
                                            photo.sheetName
                                            ];

                                        const rowKey = JSON.stringify([
                                            entry.id,
                                            photo.sheetName,
                                            photo.rowNumber,
                                        ]);

                                        const resolved =
                                            resolveProductPhotoDecision({
                                                decisions:
                                                    productPhotoDecisions,
                                                clientFileId: entry.id,
                                                sha256:
                                                    entry.result!.sha256,
                                                sheetName:
                                                    photo.sheetName,
                                                rowNumber:
                                                    photo.rowNumber,
                                            });

                                        const decision =
                                            resolved.decision;

                                        const skipped =
                                            decision?.action === "SKIP_ALL" ||
                                            decision?.action === "SKIP";

                                        const selected =
                                            decision?.action !== "USE" ||
                                            (
                                                decision.sourcePath ===
                                                photo.sourcePath &&
                                                decision.columnNumber ===
                                                photo.columnNumber
                                            );

                                        return (
                                            mapping?.enabled === true &&
                                            photo.rowNumber >
                                            mapping.headerRowNumber &&
                                            !excludedProductKeys.includes(
                                                rowKey,
                                            ) &&
                                            !skipped &&
                                            selected
                                        );
                                    }),
                                }]
                                : [],
                        )}
                        settings={importSettings}
                    />
                )}
            </section>
        </main>
    );
}
