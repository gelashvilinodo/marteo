import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { createPrismaClient } from "@/lib/prisma";
import { AiChatError, getAnthropicClient, MARTEO_AI_MODEL } from "./anthropic-client";
import type { AiDraftItem, AiPurchaseDraft, AiSourceRow } from "./purchase-draft-types";

const MATERIAL_UNITS = ["PCS", "KG", "G", "L", "ML", "M", "CM", "MM", "M2", "M3"] as const;

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;

const DRAFT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "is_purchase_table", "currency", "currency_reason", "supplier", "country", "purchase_date",
        "price_columns", "items", "file_totals", "extra_amounts", "payment_hints", "notes",
    ],
    properties: {
        is_purchase_table: { type: "boolean" },
        currency: nullableString,
        currency_reason: { type: "string" },
        supplier: nullableString,
        country: nullableString,
        purchase_date: nullableString,
        price_columns: {
            type: "object",
            additionalProperties: false,
            required: ["main", "alternative"],
            properties: { main: { type: "string" }, alternative: nullableString },
        },
        items: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "row", "original_name", "name", "color", "size", "quantity",
                    "unit_price", "alt_unit_price", "category", "unit", "existing_name",
                ],
                properties: {
                    row: { type: "integer" },
                    original_name: { type: "string" },
                    name: { type: "string" },
                    color: nullableString,
                    size: nullableString,
                    quantity: { type: "number" },
                    unit_price: { type: "number" },
                    alt_unit_price: nullableNumber,
                    category: { type: "string" },
                    unit: { type: "string", enum: MATERIAL_UNITS },
                    existing_name: nullableString,
                },
            },
        },
        file_totals: {
            type: "object",
            additionalProperties: false,
            required: ["quantity", "amount", "alt_amount"],
            properties: { quantity: nullableNumber, amount: nullableNumber, alt_amount: nullableNumber },
        },
        extra_amounts: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["row", "label", "amount"],
                properties: { row: { type: "integer" }, label: { type: "string" }, amount: { type: "number" } },
            },
        },
        payment_hints: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["row", "amount", "currency"],
                properties: { row: { type: "integer" }, amount: { type: "number" }, currency: { type: "string" } },
            },
        },
        notes: { type: "array", items: { type: "string" } },
    },
} as const;

type RawDraft = {
    is_purchase_table: boolean;
    currency: string | null;
    currency_reason: string;
    supplier: string | null;
    country: string | null;
    purchase_date: string | null;
    price_columns: { main: string; alternative: string | null };
    items: Array<{
        row: number;
        original_name: string;
        name: string;
        color: string | null;
        size: string | null;
        quantity: number;
        unit_price: number;
        alt_unit_price: number | null;
        category: string;
        unit: typeof MATERIAL_UNITS[number];
        existing_name: string | null;
    }>;
    file_totals: { quantity: number | null; amount: number | null; alt_amount: number | null };
    extra_amounts: Array<{ row: number; label: string; amount: number }>;
    payment_hints: Array<{ row: number; amount: number; currency: string }>;
    notes: string[];
};

const SYSTEM_PROMPT = `You turn a supplier's purchase table (invoice, order list or price list) into purchase lines for Marteo, a Georgian business app. The table is given row by row as "R<row>: cell | cell | ...".

For every product row create one item:
- row: the row number. original_name: the product text exactly as in the file.
- name: the product name in natural Georgian WITHOUT color and size. Keep brand and model names (Latin proper nouns such as Chester, Pebbled, Zara) unchanged and translate only descriptive words. All colors or sizes of the same model must get exactly the same name.
- color and size: from the name or their own columns, translated to common Georgian words (for example Siyah → შავი, Acı Kahve → მუქი ყავისფერი, Krem → კრემისფერი); null when absent.
- quantity and unit_price: copy the numbers exactly as they appear in that row. Never calculate them. If there are two unit price columns (for example with and without VAT/KDV), unit_price is the price including tax and alt_unit_price the other one; otherwise alt_unit_price is null. Put the column headers in price_columns.
- category: a short Georgian category (for example ჩანთები). Reuse one of the existing categories when it fits.
- unit: PCS unless the row clearly measures weight, volume or length.
- existing_name: only when the file product is clearly the very same model as one in EXISTING PRODUCTS (the same brand or model name), copy that name exactly. Being the same kind of product (both are bags) is not enough. When unsure, null.

Header, empty and summary rows are not items. Put a grand total of quantities and amounts in file_totals (amount for the main price column, alt_amount for the other). Put other standalone amounts that are not product lines (shipping, discount, fees) in extra_amounts with a short Georgian label describing what it probably is. Put amounts in another currency or marked as paid (for example "1564 DOLAR") in payment_hints with an ISO currency code.

currency: the ISO code of the prices, inferred from symbols, words or language (a Turkish invoice with KDV is most likely TRY); null if you cannot tell. currency_reason: one short Georgian sentence why. supplier, country (in Georgian) and purchase_date (YYYY-MM-DD) only when the file shows them; country may be inferred from the language. notes: at most 3 short Georgian sentences for the shop owner about anything unclear in the file; never mention field names or these instructions. If the table is not a purchase list at all, set is_purchase_table to false and return no items.`;

function cellNumbers(cells: string[]) {
    const numbers: number[] = [];

    for (const cell of cells) {
        for (const match of cell.replace(/ /g, " ").matchAll(/-?\d[\d .,']*/g)) {
            let token = match[0].trim().replace(/[ ']/g, "");
            const comma = token.lastIndexOf(",");
            const dot = token.lastIndexOf(".");

            if (comma >= 0 && dot >= 0) {
                token = comma > dot ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, "");
            } else if (comma >= 0) {
                token = /^\d{1,3}(,\d{3})+$/.test(token) ? token.replace(/,/g, "") : token.replace(",", ".");
            } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(token)) {
                token = token.replace(/\./g, "");
            }

            const value = Number(token.replace(/[.,]$/, ""));
            if (Number.isFinite(value)) numbers.push(value);
        }
    }

    return numbers;
}

function appearsIn(value: number, numbers: number[]) {
    return numbers.some((candidate) => Math.abs(candidate - value) < 0.005);
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
}

function cleanText(value: string | null | undefined, max: number) {
    const result = (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
    return result || null;
}

function normalize(value: string | null | undefined) {
    return (value ?? "").normalize("NFKC").toLocaleLowerCase("ka").replace(/\s+/g, " ").trim();
}

// AI-ის მიბმა მხოლოდ მაშინ ვენდობით, როცა სახელი ზუსტად ემთხვევა ან
// არსებულ სახელში არსებული ლათინური მოდელის სახელი ფაილის ხაზშიც წერია.
function plausibleMatch(existing: string, translated: string, original: string) {
    if (normalize(existing) === normalize(translated)) return true;

    const models = normalize(existing).match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
    const source = normalize(original);
    return models.some((model) => source.includes(model));
}

type ExistingVariant = {
    id: string;
    productName: string;
    brand: string | null;
    category: string | null;
    description: string | null;
    color: string | null;
    size: string | null;
};

type ExistingMaterial = { id: string; name: string; category: string | null; unit: string };

export async function createPurchaseDraft(options: {
    prisma: ReturnType<typeof createPrismaClient>;
    businessId: string;
    target: "products" | "materials";
    fileName: string;
    rows: AiSourceRow[];
    photoCount: number;
}): Promise<AiPurchaseDraft> {
    const { prisma, businessId, target, rows } = options;

    const variants = target === "products"
        ? await prisma.$queryRaw<ExistingVariant[]>`
            SELECT i.id, p.name AS "productName", p.brand, p.category, p.description, i.color, i.size
            FROM "InventoryItem" i JOIN "Product" p ON p.id = i."productId"
            WHERE i."businessId" = ${businessId} AND i."isActive" = TRUE
            ORDER BY i."updatedAt" DESC
            LIMIT 1500`
        : [];
    const materials = target === "materials"
        ? await prisma.$queryRaw<ExistingMaterial[]>`
            SELECT id, name, category, unit::text AS unit FROM "Material"
            WHERE "businessId" = ${businessId}
            ORDER BY "updatedAt" DESC
            LIMIT 400`
        : [];

    const existingNames = target === "products"
        ? [...new Set(variants.map((variant) => variant.productName))].slice(0, 400)
        : materials.map((material) => material.name);
    const categories = [...new Set(
        (target === "products" ? variants : materials)
            .map((entry) => entry.category?.trim())
            .filter((category): category is string => Boolean(category)),
    )].slice(0, 60);

    const table = rows.map((row) => `R${row.row}: ${row.cells.join(" | ")}`).join("\n");
    const prompt = [
        `File: ${options.fileName}`,
        `Target: ${target === "products" ? "products for resale" : "raw materials for production"}`,
        `EXISTING PRODUCTS: ${existingNames.length ? existingNames.join("; ") : "(none)"}`,
        `EXISTING CATEGORIES: ${categories.length ? categories.join("; ") : "(none)"}`,
        "",
        table,
    ].join("\n");

    let response: Anthropic.Message;

    try {
        response = await getAnthropicClient().messages.create({
            model: MARTEO_AI_MODEL,
            max_tokens: 16000,
            output_config: { effort: "low", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
        }, { timeout: 110_000 });
    } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
            throw new AiChatError("მართეო AI ახლა გადატვირთულია. სცადე ცოტა ხანში.", 429);
        }
        if (error instanceof Anthropic.APIError) {
            console.error("Marteo AI purchase draft failed", error.status);
            throw new AiChatError("ფაილის დამუშავება ვერ მოხერხდა. სცადე ხელახლა.", 502);
        }
        throw error;
    }

    if (response.stop_reason === "max_tokens") {
        throw new AiChatError("ფაილი ერთი ჯერისთვის ძალიან დიდია. დაყავი რამდენიმე ფაილად.", 422);
    }

    const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
    let raw: RawDraft;

    try {
        raw = JSON.parse(text ?? "") as RawDraft;
    } catch {
        throw new AiChatError("ფაილის დამუშავება ვერ მოხერხდა. სცადე ხელახლა.", 502);
    }

    if (!raw.is_purchase_table || raw.items.length === 0) {
        throw new AiChatError("ამ ფაილში შესყიდვის ცხრილი ვერ ვიპოვე. ატვირთე ცხრილი, სადაც პროდუქტები, რაოდენობა და ფასია.", 422);
    }

    const sourceRows = new Map(rows.map((row) => [row.row, row]));
    const warnings: string[] = [];
    const flaggedRows: number[] = [];
    const usedRows = new Set<number>();

    // AI-ის ციფრები ფაილის იმავე რიგს ედარება; არ ემთხვევა → მომხმარებელი ხედავს.
    const items: AiDraftItem[] = raw.items.map((item) => {
        const source = sourceRows.get(item.row);
        const numbers = source ? cellNumbers(source.cells) : [];
        const checked = Boolean(source) &&
            !usedRows.has(item.row) &&
            appearsIn(item.quantity, numbers) &&
            appearsIn(item.unit_price, numbers) &&
            (item.alt_unit_price === null || appearsIn(item.alt_unit_price, numbers));

        usedRows.add(item.row);
        if (!checked) flaggedRows.push(item.row);

        const name = cleanText(item.name, 200) ?? cleanText(item.original_name, 200) ?? `პროდუქტი ${item.row}`;
        const color = cleanText(item.color, 100);
        const size = cleanText(item.size, 100);
        const existingName = item.existing_name && plausibleMatch(item.existing_name, item.name, item.original_name)
            ? normalize(item.existing_name)
            : "";
        let sourceInventoryItemId: string | null = null;
        let existingVariant = false;
        let finalName = name;
        let brand: string | null = null;
        let category = cleanText(item.category, 100) ?? "სხვა";
        let description: string | null = null;
        let materialId: string | null = null;

        if (target === "products" && existingName) {
            const family = variants.filter((variant) => normalize(variant.productName) === existingName);
            const exact = family.find((variant) =>
                normalize(variant.color) === normalize(color) && normalize(variant.size) === normalize(size));
            const match = exact ?? family[0];

            if (match) {
                sourceInventoryItemId = match.id;
                existingVariant = Boolean(exact);
                finalName = match.productName;
                brand = match.brand;
                category = match.category ?? category;
                description = match.description;
            }
        }

        if (target === "materials" && existingName) {
            const match = materials.find((material) => normalize(material.name) === existingName);
            if (match) {
                materialId = match.id;
                finalName = match.name;
                category = match.category ?? category;
            }
        }

        return {
            row: item.row,
            originalName: cleanText(item.original_name, 300) ?? name,
            name: finalName,
            brand,
            category,
            description,
            color,
            size,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            altUnitPrice: item.alt_unit_price,
            sourceInventoryItemId,
            existingVariant,
            materialId,
            checked,
        };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = round2(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const altAmount = items.every((item) => item.altUnitPrice !== null)
        ? round2(items.reduce((sum, item) => sum + item.quantity * (item.altUnitPrice ?? 0), 0))
        : null;

    if (flaggedRows.length) {
        warnings.push(`რიგებ(ებ)ში ${flaggedRows.slice(0, 8).join(", ")}${flaggedRows.length > 8 ? "…" : ""} რაოდენობა ან ფასი ფაილს ზუსტად ვერ შევადარე. შეამოწმე ეს პროდუქტები.`);
    }
    if (raw.file_totals.quantity !== null && Math.abs(raw.file_totals.quantity - totalQuantity) > 0.001) {
        warnings.push(`ფაილის ჯამური რაოდენობაა ${raw.file_totals.quantity}, ამოკითხული კი ${totalQuantity}.`);
    }
    if (raw.file_totals.amount !== null && Math.abs(raw.file_totals.amount - totalAmount) > 0.05 &&
        (altAmount === null || Math.abs(raw.file_totals.amount - altAmount) > 0.05)) {
        warnings.push(`ფაილის ჯამური თანხაა ${raw.file_totals.amount}, ამოკითხული პროდუქტების ჯამი კი ${totalAmount}.`);
    }
    if (target === "products" && items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
        warnings.push("პროდუქტის რაოდენობა მთელი რიცხვი უნდა იყოს. შეამოწმე მონიშნული ხაზები.");
    }
    if (items.some((item) => item.unitPrice <= 0)) {
        warnings.push("ზოგ პროდუქტს ფასი ნულოვანი აქვს. შენახვამდე შეასწორე ფაილი.");
    }

    const date = raw.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.purchase_date) ? raw.purchase_date : null;

    return {
        target,
        fileName: options.fileName,
        photoCount: options.photoCount,
        currency: raw.currency && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null,
        currencyReason: cleanText(raw.currency_reason, 300) ?? "",
        supplier: cleanText(raw.supplier, 200),
        country: cleanText(raw.country, 100),
        purchaseDate: date,
        priceColumns: {
            main: cleanText(raw.price_columns.main, 100) ?? "ფასი",
            alternative: items.every((item) => item.altUnitPrice !== null) ? cleanText(raw.price_columns.alternative, 100) : null,
        },
        items,
        totals: { quantity: totalQuantity, amount: totalAmount, altAmount },
        extraAmounts: raw.extra_amounts
            .filter((extra) => extra.amount > 0)
            .slice(0, 5)
            .map((extra) => ({ row: extra.row, label: cleanText(extra.label, 100) ?? "დამატებითი თანხა", amount: round2(extra.amount) })),
        paymentHints: raw.payment_hints
            .filter((hint) => hint.amount > 0 && /^[A-Z]{3}$/.test(hint.currency))
            .slice(0, 3)
            .map((hint) => ({ amount: round2(hint.amount), currency: hint.currency })),
        notes: raw.notes.map((note) => cleanText(note, 300)).filter((note): note is string => Boolean(note)).slice(0, 3),
        warnings,
    };
}
