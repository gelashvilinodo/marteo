"use client";

import Link from "next/link";

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
    IMPORT_CATEGORY_LABELS, IMPORT_CATEGORY_NOUNS, IMPORT_CATEGORY_ORDER,
    type ImportCategory,
} from "@/lib/imports/discover-import-sources";

import { getOrderImportNeeds } from "@/lib/imports/get-order-import-needs";
import { prepareDraftOrders } from "@/lib/imports/prepare-draft-orders";
import { prepareImportCustomers } from "@/lib/imports/prepare-import-customers";
import { buildCustomerImportPlan } from "@/lib/imports/build-customer-import-plan";
import {
    summarizeCustomerCategory,
    summarizeOrderCategory,
    summarizeProductCategory,
    type ImportCategoryStatus,
} from "@/lib/imports/summarize-import-categories";
import ImportCategoryCards from "./ImportCategoryCards";

type ImportStep = "files" | "check" | "review";

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
    // შემოწმების გვერდზე გახსნილი კატეგორია (შესასწორებლად).
    const [openCategory, setOpenCategory] = useState<ImportCategory | null>(null);
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
    const [checkNotice, setCheckNotice] = useState("");
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
    // ნაპოვნი ჩანაწერების რაოდენობა: შეკვეთებისთვის შეკვეთები და არა რიგები.
    const foundCounts = useMemo(() => {
        const counts: Partial<Record<ImportCategory, number>> = {};
        for (const category of ["customers", "products"] as const) {
            counts[category] = discovery.filter(source => source.category === category && source.suggested).reduce((sum, source) => sum + source.rowCount, 0);
        }
        const orderSources = discovery.filter(source => source.category === "orders" && source.suggested);
        if (orderSources.length > 0) {
            try {
                const files = entries.flatMap(entry => entry.result ? [{ clientFileId: entry.id, file: entry.result }] : []);
                const mappings = Object.fromEntries(entries.flatMap(entry => entry.result ? [[entry.id, Object.fromEntries(Object.entries(createDiscoveredMappings(entry.result).orders).map(([name, mapping]) => [name, { ...mapping, enabled: orderSources.some(source => source.fileId === entry.id && source.sheetName === name) }]))]] : []));
                const prepared = prepareDraftOrders({ files, settings: { orderMappings: mappings, orderOptions: createOrderImportOptions() } as unknown as ImportDraftSettings });
                counts.orders = prepared.summary.totalGroups + prepared.summary.groupingProblemRowCount;
            } catch {
                counts.orders = orderSources.reduce((sum, source) => sum + source.rowCount, 0);
            }
        }
        return counts;
    }, [discovery, entries]);
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
    const steps: ImportStep[] = ["files", "check", "review"];
    const nextStep = steps[steps.indexOf(step) + 1] ?? "review";
    function moveTo(next: ImportStep | ImportCategory) {
        if (next === "files" || next === "check" || next === "review") {
            setStep(next);
            if (next !== "check") setOpenCategory(null);
        } else {
            setStep("check");
            setOpenCategory(next);
        }
        document.getElementById("import-wizard-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const productReview = useMemo(() => {
        const sources = entries.flatMap(entry => entry.result ? entry.result.sheets.flatMap(sheet => {
            const mapping = productMappings[entry.id]?.[sheet.name];
            return mapping?.enabled ? [{ fileId: entry.id, fileName: entry.name, sheet, mapping, edits: productEdits[entry.id]?.[sheet.name] ?? {} }] : [];
        }) : []);
        const prepared = prepareImportProducts(sources, excludedProductKeys);
        const resolved = resolveImportProductDuplicates({ records: prepared.records, decisions: productDuplicateDecisions });
        const plan = buildProductImportPlan({ records: resolved.records, snapshot: productCheckSnapshot, decisions: existingProductLinks, stockPolicy: productStockPolicy, stockDate: productStockDate });
        return { plan, stockDate: getProductStockDateReview(plan, productStockDate, productStockPolicy) };
    }, [entries, productMappings, productEdits, excludedProductKeys, productDuplicateDecisions, productCheckSnapshot, existingProductLinks, productStockPolicy, productStockDate]);
    const productStockDateReview = productReview.stockDate;
    const productDateBlocked = !completedSections.includes("products") && productStockDateReview.error !== null;
    function goNext() {
        if (step === "check") {
            if (productDateBlocked) {
                setOpenCategory("products");
                requestAnimationFrame(() => document.getElementById("import-stock-date")?.scrollIntoView({ behavior: "smooth", block: "center" }));
                return;
            }
            const firstAttention = selectedCategories.find(category => !completedSections.includes(category) && (categoryStatus[category]?.attention ?? 0) > 0);
            if (firstAttention) {
                setOpenCategory(firstAttention);
                setCheckNotice("ჯერ გაასწორეთ ან გამოტოვეთ მონიშნული ჩანაწერები.");
                return;
            }
        }
        setCheckNotice("");
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
        if (openCategory === category) setOpenCategory(null);
    }
    function includeCategory(category: ImportCategory) {
        const sources = discovery.filter(source => source.category === category);
        const enable = <T extends { enabled: boolean },>(current: Record<string, Record<string, T>>) => Object.fromEntries(Object.entries(current).map(([id, sheets]) => [id, Object.fromEntries(Object.entries(sheets).map(([name, mapping]) => [name, { ...mapping, enabled: mapping.enabled || sources.some(source => source.fileId === id && source.sheetName === name && source.suggested) }]))]));
        if (category === "orders") setOrderMappings(enable);
        if (category === "customers") {
            setCustomerMappings(enable);
            setSkipOrderCustomers(false);
        }
        if (category === "products") setProductMappings(enable);
    }
    function skipAttention(category: ImportCategory) {
        const keys = categoryStatus[category]?.attentionKeys ?? [];
        const add = (current: string[]) => [...new Set([...current, ...keys])];
        if (category === "orders") setExcludedOrderKeys(add);
        if (category === "customers") setExcludedCustomerKeys(add);
        if (category === "products") setExcludedProductKeys(add);
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

    // თითო კატეგორიის მოკლე შეჯამება შემოწმების გვერდისთვის.
    const categoryStatus: Partial<Record<ImportCategory, ImportCategoryStatus>> = {};
    if (step === "check") {
        const draftFiles = entries.flatMap(entry => entry.result ? [{ clientFileId: entry.id, file: entry.result }] : []);
        if (selectedCategories.includes("orders")) {
            try {
                categoryStatus.orders = summarizeOrderCategory(prepareDraftOrders({ files: draftFiles, settings: importSettings }), orderGroupingConfirmations);
            } catch {
                // შეცდომას შეკვეთების დეტალური ბლოკი აჩვენებს.
            }
        }
        if (selectedCategories.includes("customers")) {
            const customerSources = entries.flatMap(entry => entry.result ? entry.result.sheets.flatMap(sheet => {
                const mapping = customerMappings[entry.id]?.[sheet.name];
                return mapping?.enabled ? [{ fileId: entry.id, fileName: entry.name, sheet, mapping, edits: customerEdits[entry.id]?.[sheet.name] ?? {} }] : [];
            }) : []);
            const customerPlan = buildCustomerImportPlan({ records: prepareImportCustomers(customerSources, excludedCustomerKeys).records, snapshot: customerCheckSnapshot, links: existingCustomerLinks });
            categoryStatus.customers = summarizeCustomerCategory(customerPlan, excludedCustomerKeys.length);
        }
        if (selectedCategories.includes("products")) {
            categoryStatus.products = summarizeProductCategory(productReview.plan, excludedProductKeys.length);
        }
    }

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

    // ისტორიული შეკვეთები ძველი თარიღებითაა, ამიტომ დასრულების
    // შემდეგ მათ პერიოდზე პირდაპირ ბმულს ვაჩვენებთ.
    let importedOrderRange: { from: string; to: string } | null = null;
    if (productsImported && completedSections.includes("orders")) {
        try {
            const dates = prepareDraftOrders({
                files: entries.flatMap(entry => entry.result ? [{ clientFileId: entry.id, file: entry.result }] : []),
                settings: importSettings,
            }).orders.flatMap(order => order.result.kind === "PREVIEW_READY" ? [order.result.data.date] : []).sort();
            if (dates.length > 0) importedOrderRange = { from: dates[0], to: dates[dates.length - 1] };
        } catch {
            importedOrderRange = null;
        }
    }
    const shortDate = (value: string) => value.split("-").reverse().join(".");

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
                        {importedOrderRange && <p className="text-sm text-text-secondary">
                            შეკვეთები {shortDate(importedOrderRange.from)} - {shortDate(importedOrderRange.to)} პერიოდისაა. სიაში სანახავად ეს პერიოდი აირჩიეთ.
                        </p>}
                    </div>
                    {importedOrderRange && <div className="flex flex-wrap justify-center gap-2">
                        <Link href={`/dashboard/orders?period=custom&from=${importedOrderRange.from}&to=${importedOrderRange.to}`} className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white">შეკვეთების ნახვა</Link>
                        <Link href={`/dashboard/analytics?period=custom&from=${importedOrderRange.from}&to=${importedOrderRange.to}`} className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm">ანალიტიკა ამ პერიოდზე</Link>
                    </div>}
                    <button type="button" onClick={startNewImport} className={importedOrderRange ? "min-h-12 rounded-xl border border-border px-5 text-sm" : "min-h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-white"}>ახალი იმპორტის დაწყება</button>
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
                    ატვირთეთ ფაილი - MARTEO თავად იპოვის შეკვეთებს,
                    მომხმარებლებსა და პროდუქტებს.
                </p>
            </div>

            <nav aria-label="იმპორტის ნაბიჯები" className="flex flex-wrap gap-2">
                {steps.map((item, index) => <button key={item} type="button" disabled={draftSaving || busy || (item !== "files" && availableCategories.length === 0)} aria-current={step === item ? "step" : undefined} onClick={() => moveTo(item)} className={`min-h-10 rounded-xl border px-3 text-sm disabled:opacity-40 ${step === item ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border text-text-secondary"}`}>
                    {index + 1}. {item === "files" ? "ფაილები" : item === "review" ? "გადმოტანა" : "შემოწმება"}
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
                    Excel, CSV ან Apple Numbers. რამდენიმე ფაილიც შეიძლება.
                </p>


                {entries.length > 0 && <div className="space-y-2">
                    {entries.map(entry => <div key={entry.id} className="rounded-xl border border-border p-3 text-sm">
                        <p className="break-all font-medium">{entry.name}</p>
                        <p className={entry.error ? "mt-1 text-danger" : "mt-1 text-text-secondary"}>{entry.error || labels[entry.state]}</p>
                        {entry.result && entry.result.issues.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-danger">ფაილში აღმოჩენილი საკითხები ({entry.result.issues.length})</summary><ImportSourceIssues result={entry.result} /></details>}
                    </div>)}
                </div>}
                {discovery.length > 0 && <div className="space-y-3">
                    <h2 className="font-semibold">ფაილში ვიპოვეთ</h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {IMPORT_CATEGORY_ORDER.filter(category => availableCategories.includes(category)).map(category => {
                            const sources = discovery.filter(source => source.category === category && (source.suggested || selectedCategories.includes(category)));
                            const missing = [...new Set(sources.flatMap(source => source.missing))];
                            const done = completedSections.includes(category);
                            return <label key={category} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedCategories.includes(category) ? "border-accent bg-accent/5" : "border-border"}`}>
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.includes(category)}
                                    disabled={done || busy || draftSaving}
                                    onChange={event => event.target.checked ? includeCategory(category) : skipCategory(category)}
                                    className="mt-1 h-5 w-5 shrink-0"
                                />
                                <span className="min-w-0 space-y-1">
                                    <span className="block font-semibold">{foundCounts[category] ?? 0} {IMPORT_CATEGORY_NOUNS[category]}</span>
                                    <span className="block break-words text-xs text-text-secondary">{done ? "უკვე გადმოტანილია" : sources.map(source => source.sheetName).join(", ")}</span>
                                    {!done && missing.length > 0 && <span className="block text-xs text-danger">აკლია: {missing.join(", ")}</span>}
                                </span>
                            </label>;
                        })}
                    </div>
                    <p className="text-xs text-text-secondary">მონიშნეთ, რისი გადმოტანა გსურთ. შემდეგ ნაბიჯზე ყველაფერს შევამოწმებთ.</p>
                </div>}
                {unrecognizedSheets.length > 0 && <details className="space-y-3 rounded-xl border border-border p-4 text-sm">
                    <summary className="cursor-pointer">სხვა ფურცლები ({unrecognizedSheets.length})</summary>
                    <p className="mt-3 text-text-secondary">ამ ფურცლებს ვერ ვიცნობთ. თუ საჭიროა, მიუთითეთ, რა არის მათში.</p>
                    {unrecognizedSheets.map(({ fileId, fileName, sheet }) => <div key={JSON.stringify([fileId, sheet.name])} className="space-y-2 rounded-lg border border-border p-3">
                        <p className="break-words font-medium">{fileName} / {sheet.name}</p>
                        {/პარტი|შესყიდვ|purchase|procurement|batch/i.test(sheet.name) ? <p className="text-text-secondary">შესყიდვების/პარტიების ისტორია ამ იმპორტში არ გადმოდის.</p>
                        : <div className="flex flex-wrap gap-2">{IMPORT_CATEGORY_ORDER.map(category => <button key={category} type="button" disabled={draftSaving || busy || completedSections.length > 0} onClick={() => assignSource(category, fileId, sheet)} className="min-h-10 rounded-lg border border-border px-3">{IMPORT_CATEGORY_LABELS[category]}</button>)}</div>}
                    </div>)}
                </details>}
                {availableCategories.length > 0 && <button type="button" disabled={busy || draftSaving || draftLoading} onClick={goNext} className="min-h-12 w-full rounded-xl bg-accent px-5 font-semibold text-white sm:w-auto">შემოწმება</button>}

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
                            : "ფაილები აღდგენილია. არჩევანი ხელახლა გადაამოწმეთ.",
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
                    ნაწილი უკვე გადმოტანილია. გააგრძელეთ დარჩენილით.
                </p>
            )}


            {step === "check" && !productsImported && (
                <ImportCategoryCards
                    categories={availableCategories}
                    selected={selectedCategories}
                    completed={completedSections}
                    status={categoryStatus}
                    open={openCategory}
                    onOpen={category => {
                        setCheckNotice("");
                        setOpenCategory(current => current === category ? null : category);
                    }}
                    onSkip={skipCategory}
                    onInclude={includeCategory}
                    onSkipAttention={skipAttention}
                />
            )}
            {step === "check" && openCategory && <div className="space-y-2">
                <h2 className="text-xl font-semibold">{IMPORT_CATEGORY_LABELS[openCategory]}</h2>
                <p className="text-sm text-text-secondary">გაასწორეთ მონიშნული ჩანაწერები ან გამოტოვეთ ისინი. დანარჩენი მზადაა.</p>
                {openCategory === "orders" && <p className="text-xs text-text-secondary">გადმოდის ძველი შეკვეთების ისტორია. მიმდინარე მარაგს არ შევცვლით.</p>}
            </div>}
            <fieldset
                disabled={draftSaving || productsImported}
                hidden={step !== "check" || openCategory === null || productsImported}
                className="min-w-0 space-y-5 border-0 p-0"
            >
                {entries.filter(entry => entry.result && openCategory !== null && (
                    openCategory === "orders" ? Object.values(orderMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === openCategory)
                    : openCategory === "customers" ? Object.values(customerMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === openCategory)
                    : Object.values(productMappings[entry.id] ?? {}).some(m => m.enabled) || discovery.some(d => d.fileId === entry.id && d.category === openCategory)
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

                        {openCategory === "products" && entry.state === "READY" &&
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

                        {openCategory === "products" && entry.state === "READY" && entry.result && (
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

                        {openCategory === "products" && entry.state === "READY" &&
                            entry.savedPhotos &&
                            entry.savedPhotos.length > 0 && (
                                <ImportSavedPhotoPreview
                                    photos={entry.savedPhotos}
                                />
                            )}
                        {openCategory === "products" && entry.state === "READY" && entry.photoResult && (
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
                                category={openCategory ?? "orders"}
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

                {openCategory === "orders" && ordersSelected && (
                    <>
                        <OrderImportOptionsPicker
                            needs={getOrderImportNeeds(entries.flatMap(entry => entry.result ? [{ clientFileId: entry.id, file: entry.result }] : []), importSettings)}
                            value={orderOptions}
                            onChange={setOrderOptions}
                        />

                        <ImportOrdersSummary
                            autoReview
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

                <div hidden={openCategory !== "customers"}>
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
                <div hidden={openCategory !== "products"}>
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

            {step === "check" && !productsImported && (
                <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface p-4 shadow-lg sm:mx-0 sm:rounded-xl sm:border">
                    <button type="button" disabled={draftSaving} onClick={goBack} className="min-h-11 rounded-xl border border-border px-4 text-sm">უკან</button>
                    <div className="flex flex-wrap gap-2">
                        {openCategory === "products" && productDateBlocked && <p role="alert" className="w-full text-sm text-danger">{productStockDateReview.error}</p>}
                        {checkNotice && <p role="alert" className="w-full text-sm text-danger">{checkNotice}</p>}
                        <button type="button" disabled={draftSaving} onClick={goNext} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white">გადმოტანაზე გადასვლა</button>
                    </div>
                </div>
            )}

            <section hidden={step !== "review"} className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
                <h2 className="text-lg font-semibold">გადმოტანა MARTEO-ში</h2>
                <p className="text-sm text-text-secondary">თუ რამე გასასწორებელი აღმოჩნდა, შევჩერდებით და გაჩვენებთ.</p>
                {selectedCategories.length === 0 && <p role="status" className="text-sm text-text-secondary">გადმოსატანი არაფერია მონიშნული. დაბრუნდით წინა ნაბიჯზე.</p>}
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
                            if (allDone) setDraftNotice("მონიშნული მონაცემების გადმოტანა დასრულებულია.");
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
                {!productsImported && !draftSaving && <button type="button" onClick={goBack} className="min-h-11 rounded-xl border border-border px-4 text-sm">უკან</button>}
            </section>
        </main>
    );
}
