import { detectCustomerColumns, normalizeImportHeader } from "./detect-customer-columns";
import { detectProductColumns } from "./detect-product-columns";
import { detectOrderColumns } from "./detect-order-columns";
import type { ParsedImportFile, ParsedImportSheet } from "./import-file-types";
import type { ImportCustomerMapping } from "./import-types";
import { createProductImportMapping, type ProductImportMapping } from "./product-import-mapping";
import { createOrderImportMapping, type OrderImportMapping } from "./order-import-mapping";

export type ImportCategory = "orders" | "customers" | "products";
export const IMPORT_CATEGORY_ORDER: ImportCategory[] = ["orders", "customers", "products"];
export const IMPORT_CATEGORY_LABELS: Record<ImportCategory, string> = {
    orders: "შეკვეთები", customers: "მომხმარებლები", products: "პროდუქტები და მარაგები",
};
export type DiscoveredImportSource = {
    sheetName: string;
    category: ImportCategory;
    headerRowNumber: number;
    rowCount: number;
    missing: string[];
    score: number;
    suggested: boolean;
};

export function importColumnNumber(address: string): number | null {
    const letters = /^([A-Z]+)[1-9]\d*$/i.exec(address)?.[1].toUpperCase();
    if (!letters) return null;
    return [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
}

function headers(row: ParsedImportSheet["rows"][number]) {
    return row.cells.flatMap(cell => {
        const columnIndex = importColumnNumber(cell.address);
        return columnIndex && typeof cell.value === "string" && cell.errorCode === null
            ? [{ columnIndex, value: cell.value }] : [];
    });
}

// Exact, deterministic aliases: discovery proposes sources; the normal validators
// remain authoritative. No value or missing payment/date is invented here.
export function discoverImportSources(file: ParsedImportFile): DiscoveredImportSource[] {
    const result: DiscoveredImportSource[] = [];
    for (const sheet of file.sheets) {
        const title = normalizeImportHeader(sheet.name);
        // Purchase imports were explicitly excluded. Do not misclassify their
        // quantity/date/line-total columns as historical sales.
        if (/პარტი|შესყიდვ|purchase|procurement|batch/.test(title)) continue;
        const hints = {
            customers: /მომხმარებ|კლიენტ|customer|client|contact/.test(title),
            products: /პროდუქტ|მარაგ|product|inventory|stock/.test(title),
            orders: /შეკვეთ|order|sales|გაყიდვ/.test(title),
        };
        const best = new Map<ImportCategory, DiscoveredImportSource>();
        for (const row of sheet.rows.slice(0, 30)) {
            const h = headers(row);
            if (h.length === 0) continue;
            const customer = detectCustomerColumns(h);
            const product = detectProductColumns(h);
            const order = detectOrderColumns(h);
            const c = new Set(customer.filter(v => v.status === "MATCHED").map(v => v.field));
            const p = new Set(product.filter(v => v.status === "MATCHED").map(v => v.field));
            const o = new Set(order.filter(v => v.status === "MATCHED").map(v => v.field));
            const orderSignal = o.has("orderCode") ||
                (o.has("quantity") && (o.has("unitPrice") || o.has("lineTotal")) &&
                    (o.has("date") || o.has("status") || o.has("phone") || hints.orders));
            const customerSignal = c.has("phone") || c.has("address") ||
                (hints.customers && (c.has("firstName") || c.has("lastName") || c.has("sourceCode")));
            const explicitStock = h.some(header => /მარაგ|ნაშთ|stock|balance|available/.test(normalizeImportHeader(header.value)));
            const stockSignal = p.has("currentStock") && (!orderSignal || explicitStock);
            const explicitProductName = h.some(header => /პროდუქტ|საქონ|product|item/.test(normalizeImportHeader(header.value)) &&
                product.some(item => item.field === "name" && item.selectedColumnIndex === header.columnIndex));
            const explicitProductCode = h.some(header => /sku|barcode|ბარკოდ|არტიკულ|პროდუქტის კოდ|product code/.test(normalizeImportHeader(header.value)));
            const productSignal = stockSignal ||
                (p.has("name") && (hints.products ||
                    (!orderSignal && (explicitProductName || (!customerSignal && (p.has("salePrice") || p.has("unitCost") || p.has("category") || explicitProductCode))))));
            const candidates: [ImportCategory, boolean, number, string[]][] = [
                ["orders", orderSignal || (hints.orders && o.size >= 2), o.size * 2 + (hints.orders ? 5 : 0),
                    [...(!o.has("name") ? ["პროდუქტის დასახელება"] : []), ...(!o.has("quantity") ? ["რაოდენობა"] : []),
                        ...(!o.has("unitPrice") && !o.has("lineTotal") ? ["პროდუქტის ფასი ან ხაზის ჯამი"] : [])]],
                ["customers", customerSignal, c.size * 2 + (hints.customers ? 7 : 0),
                    [...(!c.has("phone") ? ["ტელეფონი"] : []), ...(!c.has("address") ? ["მისამართი"] : [])]],
                ["products", productSignal, p.size * 2 + (hints.products ? 7 : 0) + (stockSignal ? 4 : 0),
                    !p.has("name") ? ["პროდუქტის დასახელება"] : []],
            ];
            for (const [category, possible, score, missing] of candidates) {
                if (!possible) continue;
                const rowCount = sheet.rows.filter(r => r.rowNumber > row.rowNumber && r.cells.some(cell =>
                    cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== "")).length;
                if (!rowCount) continue;
                if ((best.get(category)?.score ?? -1) < score) best.set(category, {
                    sheetName: sheet.name, category, headerRowNumber: row.rowNumber,
                    rowCount, missing, score, suggested: true,
                });
            }
        }
        result.push(...best.values());
    }
    // Prefer dedicated customer sheets over the same contacts repeated on every
    // order. Secondary sources remain visible and can be included explicitly.
    for (const category of IMPORT_CATEGORY_ORDER) {
        const sources = result.filter(source => source.category === category);
        const dedicated = sources.filter(source => category === "customers"
            ? /მომხმარებ|კლიენტ|customer|client|contact/.test(normalizeImportHeader(source.sheetName))
            : false);
        if (dedicated.length) for (const source of sources) source.suggested = dedicated.includes(source);
    }
    return result;
}

function decimalSeparator(sheet: ParsedImportSheet, headerRowNumber: number, columns: readonly { field: string; selectedColumnIndex: number | null }[]): "." | "," {
    const fields = new Set(["salePrice", "unitCost", "unitPrice", "lineTotal", "orderTotal", "paidAmount", "courierFee"]);
    const moneyColumns = new Set(columns.filter(column => fields.has(column.field)).map(column => column.selectedColumnIndex));
    let commas = 0;
    let dots = 0;
    for (const row of sheet.rows.filter(row => row.rowNumber > headerRowNumber).slice(0, 50)) {
        for (const cell of row.cells) {
            if (!moneyColumns.has(importColumnNumber(cell.address)) || typeof cell.value !== "string") continue;
            if (/^\d+,\d{1,2}$/.test(cell.value.trim())) commas++;
            if (/^\d+\.\d{1,2}$/.test(cell.value.trim())) dots++;
        }
    }
    return commas > 0 && dots === 0 ? "," : ".";
}

export function createDiscoveredMappings(file: ParsedImportFile) {
    const customers: Record<string, ImportCustomerMapping> = {};
    const products: Record<string, ProductImportMapping> = {};
    const orders: Record<string, OrderImportMapping> = {};
    for (const source of discoverImportSources(file)) {
        const sheet = file.sheets.find(s => s.name === source.sheetName)!;
        const h = headers(sheet.rows.find(r => r.rowNumber === source.headerRowNumber)!);
        if (source.category === "customers") customers[source.sheetName] = {
            enabled: source.suggested, headerRowNumber: source.headerRowNumber, includeNames: true, overrides: {},
        };
        if (source.category === "products") {
            const detected = detectProductColumns(h);
            products[source.sheetName] = { ...createProductImportMapping(source.headerRowNumber),
                enabled: source.suggested, decimalSeparator: decimalSeparator(sheet, source.headerRowNumber, detected), mode: detected.some(v => v.field === "currentStock" && v.status === "MATCHED") ? "CURRENT_STOCK" : "CATALOG" };
        }
        if (source.category === "orders") orders[source.sheetName] = {
            ...createOrderImportMapping(source.headerRowNumber), enabled: source.suggested,
            decimalSeparator: decimalSeparator(sheet, source.headerRowNumber, detectOrderColumns(h)),
        };
    }
    return { customers, products, orders };
}
