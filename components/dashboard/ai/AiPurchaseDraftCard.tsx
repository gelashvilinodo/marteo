"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { AiPurchaseDraft } from "@/lib/ai/purchase-draft-types";
import { refreshPurchasesAfterMutation } from "@/lib/purchases/refresh-purchases-client";
import { useAiAssistant, type AiMessage } from "./AiAssistantProvider";

const CURRENCIES = ["GEL", "USD", "EUR", "TRY", "CNY", "GBP", "RUB", "AED", "UAH", "AZN", "AMD", "KZT", "PLN", "CHF", "JPY", "INR"];
const UNIT_LABELS: Record<string, string> = {
    PCS: "ცალი", KG: "კგ", G: "გ", L: "ლ", ML: "მლ", M: "მ", CM: "სმ", MM: "მმ", M2: "მ²", M3: "მ³",
};

type ExtraKind = "" | "shipping" | "customs" | "other" | "ignore";
type RateMode = "nbg" | "custom" | "paidGel" | "hint";
type RateEntry = { rate: number; date: string } | { error: string };

function money(value: number) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");
}

function amount(value: string) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function tbilisiToday() {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatDate(date: string) {
    return date.split("-").reverse().join(".");
}

const inputClass = "h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-text-secondary">
            <span>{label}</span>
            {children}
        </label>
    );
}

function Choice<T extends string>({ value, options, onChange }: {
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
}) {
    return (
        <div className="grid gap-1 rounded-xl bg-background p-1 ring-1 ring-inset ring-border" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                    className={[
                        "min-h-8 rounded-lg px-2 text-xs font-medium transition",
                        value === option.value ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary",
                    ].join(" ")}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default function AiPurchaseDraftCard({ message }: { message: AiMessage & { draft: AiPurchaseDraft } }) {
    const { draft } = message;
    const router = useRouter();
    const { updateMessage, addAssistantMessage } = useAiAssistant();
    const products = draft.target === "products";

    const [name, setName] = useState(draft.supplier ?? draft.fileName.replace(/\.[^.]+$/, ""));
    const [country, setCountry] = useState(draft.country ?? "");
    const [date, setDate] = useState(draft.purchaseDate ?? tbilisiToday());
    const [status, setStatus] = useState<"" | "IN_TRANSIT" | "RECEIVED">("");
    // ორი ფასის სვეტიდან (მაგ. დღგ-ით და მის გარეშე) მომხმარებელი თავად ირჩევს.
    const [priceColumn, setPriceColumn] = useState<"" | "main" | "alt">(draft.priceColumns.alternative ? "" : "main");
    const [currency, setCurrency] = useState(draft.currency ?? "GEL");
    const [mode, setMode] = useState<RateMode>("nbg");
    const [customRate, setCustomRate] = useState("");
    const [paidGel, setPaidGel] = useState("");
    const [extras, setExtras] = useState<ExtraKind[]>(() => draft.extraAmounts.map(() => ""));
    const [pricingMethod, setPricingMethod] = useState<"MARKUP_PERCENT" | "MARGIN_PERCENT" | "FIXED_PROFIT">("MARKUP_PERCENT");
    const [pricingValue, setPricingValue] = useState("");
    const [showItems, setShowItems] = useState(false);
    const [rates, setRates] = useState<Record<string, RateEntry>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const hint = draft.paymentHints[0];
    const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
    const neededRates = [
        currency !== "GEL" && mode === "nbg" ? currency : null,
        currency !== "GEL" && mode === "hint" && hint && hint.currency !== "GEL" ? hint.currency : null,
    ].filter((code): code is string => Boolean(code));
    const rateKey = (code: string) => `${code}|${date}`;

    useEffect(() => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const controller = new AbortController();

        for (const code of neededRates) {
            if (rates[`${code}|${date}`]) continue;

            fetch(`/api/ai/exchange-rate?currency=${code}&date=${date}`, { credentials: "same-origin", signal: controller.signal })
                .then(async (response) => {
                    const data = await response.json().catch(() => null) as { rate?: number; date?: string; message?: string } | null;
                    const entry: RateEntry = response.ok && data?.rate && data.date
                        ? { rate: data.rate, date: data.date }
                        : { error: data?.message || "კურსი ვერ ჩაიტვირთა." };
                    setRates((current) => ({ ...current, [`${code}|${date}`]: entry }));
                })
                .catch(() => {});
        }

        return () => controller.abort();
    // neededRates ყოველ რენდერზე ახალი მასივია; შინაარსი სტრიქონით შედარდება.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [neededRates.join(","), date, rates]);

    const price = (item: AiPurchaseDraft["items"][number]) =>
        priceColumn === "alt" && item.altUnitPrice !== null ? item.altUnitPrice : item.unitPrice;
    const foreignTotal = draft.items.reduce((sum, item) => sum + item.quantity * price(item), 0);

    const rateInfo = useMemo((): { rate: number | null; label: string; problem: string } => {
        if (currency === "GEL") return { rate: 1, label: "", problem: "" };

        if (mode === "custom") {
            const rate = amount(customRate);
            return { rate, label: rate ? `ჩემი კურსი: 1 ${currency} = ${rate} ₾` : "", problem: rate ? "" : "მიუთითე კურსი." };
        }

        if (mode === "paidGel") {
            const paid = amount(paidGel);
            return {
                rate: paid && foreignTotal > 0 ? paid / foreignTotal : null,
                label: paid ? `რეალურად გადახდილი: ${money(paid)} ₾` : "",
                problem: paid ? "" : "მიუთითე ლარში გადახდილი თანხა.",
            };
        }

        const code = mode === "hint" && hint ? hint.currency : currency;
        const entry = code === "GEL" ? { rate: 1, date } : rates[rateKey(code)];

        if (!entry) return { rate: null, label: "", problem: "ეროვნული ბანკის კურსი იტვირთება…" };
        if ("error" in entry) return { rate: null, label: "", problem: entry.error };

        if (mode === "hint" && hint) {
            const gel = hint.amount * entry.rate;
            return {
                rate: foreignTotal > 0 ? gel / foreignTotal : null,
                label: `${money(hint.amount)} ${hint.currency} × ${entry.rate.toFixed(4)} = ${money(gel)} ₾ (ეროვნული ბანკი, ${formatDate(entry.date)})`,
                problem: "",
            };
        }

        return {
            rate: entry.rate,
            label: `1 ${currency} = ${entry.rate.toFixed(4)} ₾ (ეროვნული ბანკი, ${formatDate(entry.date)})`,
            problem: "",
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currency, mode, customRate, paidGel, rates, date, hint, foreignTotal]);

    // ერთეულის ფასი თეთრამდე ქვემოთ მრგვალდება; სხვაობა სხვა ხარჯს ემატება,
    // რომ შესყიდვის ჯამი ზუსტად ემთხვეოდეს გადაყვანილ თანხას.
    const conversion = useMemo(() => {
        const rate = rateInfo.rate;
        if (!rate) return null;

        const units = draft.items.map((item) => Math.max(0.01, Math.floor(price(item) * rate * 100 + 1e-6) / 100));
        const productsGel = draft.items.reduce((sum, item, index) => sum + item.quantity * units[index], 0);
        const targetGel = Math.round(foreignTotal * rate * 100) / 100;
        const rounding = Math.max(0, Math.round((targetGel - productsGel) * 100) / 100);
        const costs = { shipping: 0, customs: 0, other: 0 };

        draft.extraAmounts.forEach((extra, index) => {
            const kind = extras[index];
            if (kind === "shipping" || kind === "customs" || kind === "other") {
                costs[kind] += Math.round(extra.amount * rate * 100) / 100;
            }
        });

        return { units, productsGel: Math.round(productsGel * 100) / 100, targetGel, rounding, costs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rateInfo.rate, priceColumn, extras, foreignTotal]);

    const problems: string[] = [];
    if (!priceColumn) problems.push("აირჩიე, რომელი ფასი გამოვიყენო.");
    if (!status) problems.push("აირჩიე, პარტია გზაშია თუ ჩამოსულია.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push("მიუთითე თარიღი.");
    if (rateInfo.problem) problems.push(rateInfo.problem);
    if (extras.some((kind) => !kind)) problems.push("მიუთითე, რა არის დამატებითი თანხა.");
    if (products) {
        const value = Number(pricingValue.replace(",", "."));
        if (!/^\d{1,10}([.,]\d{1,2})?$/.test(pricingValue.trim())) problems.push("მიუთითე გასაყიდი ფასის ნამატი.");
        else if (pricingMethod === "MARGIN_PERCENT" && value >= 100) problems.push("მარჟა 100%-ზე ნაკლები უნდა იყოს.");
        if (draft.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) problems.push("პროდუქტის რაოდენობა მთელი რიცხვი უნდა იყოს. შეასწორე ფაილი.");
        if (draft.items.length > 200) problems.push("ერთ შესყიდვაში მაქსიმუმ 200 პროდუქტია.");
    } else if (draft.items.length > 50) {
        problems.push("ერთ პარტიაში მაქსიმუმ 50 მასალაა. დაყავი ფაილი.");
    }

    async function save() {
        if (!conversion || problems.length || saving) return;

        setSaving(true);
        setError("");

        const otherCost = conversion.costs.other + conversion.rounding;
        const sourceCurrency = currency === "GEL" ? "" : `ორიგინალი: ${money(foreignTotal)} ${currency}. ${rateInfo.label}. `;
        const note = [
            `დამატებულია მართეო AI-ით ფაილიდან ${draft.fileName}.`,
            sourceCurrency.trim(),
            conversion.rounding > 0 ? `სხვა ხარჯში შედის ${money(conversion.rounding)} ₾ კურსის დამრგვალება.` : "",
        ].filter(Boolean).join(" ").slice(0, 2000);
        const purchase = {
            receiptStatus: status,
            name: name.trim().slice(0, 200),
            country: country.trim().slice(0, 100),
            note,
            purchaseDate: date,
            shippingCost: conversion.costs.shipping.toFixed(2),
            customsCost: conversion.costs.customs.toFixed(2),
            otherCost: otherCost.toFixed(2),
        };
        const usedMaterials = new Set<string>();
        const items = draft.items.map((item, index) => products
            ? {
                sourceInventoryItemId: item.sourceInventoryItemId,
                productGroup: item.sourceInventoryItemId ? null : `${item.name}|${item.category}`.toLowerCase().slice(0, 100),
                name: item.name,
                brand: item.brand ?? "",
                category: item.category,
                description: item.description ?? "",
                color: item.color ?? "",
                size: item.size ?? "",
                quantity: String(item.quantity),
                defectiveQuantity: "0",
                defectNote: "",
                unitPurchasePrice: conversion.units[index].toFixed(2),
                pricingMethod,
                pricingValue: pricingValue.trim().replace(",", "."),
            }
            : {
                // ერთი მასალა ერთ პარტიაში ერთხელ შეიძლება იყოს მიბმული.
                materialId: item.materialId && !usedMaterials.has(item.materialId) && usedMaterials.add(item.materialId) ? item.materialId : null,
                name: item.name,
                brand: "",
                category: item.category,
                description: "",
                color: item.color ?? "",
                size: item.size ?? "",
                characteristics: "",
                unit: item.unit,
                quantity: String(item.quantity),
                defectiveQuantity: "0",
                unitPurchasePrice: conversion.units[index].toFixed(2),
            });
        // ახალ ფერს არსებული პროდუქტის სხვა ფერის ფოტო არ უნდა მიჰყვეს.
        const imageActions = draft.items.map((item) =>
            products && item.sourceInventoryItemId && !item.existingVariant ? "remove" : "keep");
        const form = new FormData();
        form.append("payload", JSON.stringify({ requestId: crypto.randomUUID(), purchase: { ...purchase, items }, imageActions }));

        try {
            const response = await fetch(products ? "/api/purchases" : "/api/material-purchases", {
                method: "POST",
                credentials: "same-origin",
                body: form,
            });
            const data = await response.json().catch(() => null) as { error?: string } | null;

            if (!response.ok) {
                setError(data?.error || "შენახვა ვერ მოხერხდა. სცადე ხელახლა.");
                return;
            }

            updateMessage(message.id, { draftSaved: true });
            addAssistantMessage({
                text: `✓ შესყიდვა შენახულია: ${draft.items.length} ${products ? "პროდუქტი" : "მასალა"}, ${money(conversion.productsGel + conversion.costs.shipping + conversion.costs.customs + otherCost)} ₾.${draft.photoCount === 0 && products ? " ფოტოები შესყიდვების გვერდზე დაამატე." : ""}`,
                link: products
                    ? { href: "/dashboard/purchases", label: "შესყიდვებზე გადასვლა" }
                    : { href: "/dashboard/material-purchases", label: "მასალების შესყიდვებზე გადასვლა" },
            });
            refreshPurchasesAfterMutation(() => router.refresh());
        } catch {
            setError("შენახვის შედეგი ვერ დადასტურდა. შეამოწმე შესყიდვების გვერდი, სანამ ხელახლა შეინახავ.");
        } finally {
            setSaving(false);
        }
    }

    const locked = message.draftSaved || saving;
    const unitLabel = (code: string) => UNIT_LABELS[code] ?? code;

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl bg-background p-3 text-sm text-text-primary ring-1 ring-inset ring-border">
            <div className="flex items-start gap-2">
                <Icon icon="solar:document-text-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="truncate font-semibold">{draft.fileName}</p>
                    <p className="text-xs text-text-secondary">
                        {draft.items.length} {products ? "პროდუქტი" : "მასალა"} · {draft.totals.quantity} {products ? "ცალი" : "ერთეული"} · {money(foreignTotal)} {currency}
                    </p>
                </div>
            </div>

            {(draft.photoCount === 0 || draft.photoCount > 0 || draft.warnings.length > 0 || draft.notes.length > 0) && (
                <ul className="flex flex-col gap-1.5 rounded-xl bg-warning/10 p-2.5 text-xs text-text-primary ring-1 ring-inset ring-warning/30">
                    {products && draft.photoCount === 0 && (
                        <li>⚠️ ამ ფაილში ფოტოები არ არის. შესყიდვა ფოტოების გარეშე შეიქმნება; ფოტოების დამატება შემდეგ შეგიძლია შესყიდვების გვერდზე, პარტიის რედაქტირებიდან.</li>
                    )}
                    {products && draft.photoCount > 0 && (
                        <li>⚠️ ფაილის ფოტოები AI-ით ჯერ არ გადმოდის. ფოტოები შესყიდვების გვერდზე დაამატე.</li>
                    )}
                    {draft.warnings.map((warning) => <li key={warning}>⚠️ {warning}</li>)}
                    {draft.notes.map((note) => <li key={note}>💬 {note}</li>)}
                </ul>
            )}

            <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3 disabled:opacity-80">
                <div className="grid grid-cols-2 gap-2">
                    <Field label="პარტიის სახელი">
                        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className={inputClass} />
                    </Field>
                    <Field label="ქვეყანა">
                        <input value={country} onChange={(event) => setCountry(event.target.value)} maxLength={100} className={inputClass} />
                    </Field>
                    <Field label="შესყიდვის თარიღი">
                        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
                    </Field>
                    <Field label="ვალუტა">
                        <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass}>
                            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
                        </select>
                    </Field>
                </div>

                {draft.currencyReason && currency === draft.currency && (
                    <p className="-mt-1 text-xs text-text-secondary">{draft.currencyReason}</p>
                )}

                <Field label="პარტიის სტატუსი">
                    <Choice
                        value={status}
                        onChange={setStatus}
                        options={[{ value: "IN_TRANSIT", label: "გზაშია" }, { value: "RECEIVED", label: "ჩამოსულია" }]}
                    />
                </Field>

                {draft.priceColumns.alternative && (
                    <Field label="რომელი ფასი გამოვიყენო?">
                        <Choice
                            value={priceColumn}
                            onChange={setPriceColumn}
                            options={[
                                { value: "main", label: `${draft.priceColumns.main} (${money(draft.totals.amount)})` },
                                { value: "alt", label: `${draft.priceColumns.alternative} (${money(draft.totals.altAmount ?? 0)})` },
                            ]}
                        />
                    </Field>
                )}

                {currency !== "GEL" && (
                    <div className="flex flex-col gap-2 rounded-xl p-2.5 ring-1 ring-inset ring-border">
                        <p className="text-xs font-medium text-text-secondary">ლარში გადაყვანა</p>
                        {([
                            ["nbg", "ეროვნული ბანკის კურსით, შესყიდვის თარიღზე"],
                            ...(hint ? [["hint", `ფაილში მითითებული ${money(hint.amount)} ${hint.currency} ლარში`]] : []),
                            ["custom", "ჩემი კურსით"],
                            ["paidGel", "რეალურად გადავიხადე ლარში"],
                        ] as Array<[RateMode, string]>).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2 text-sm">
                                <input type="radio" name={`rate-${message.id}`} checked={mode === value} onChange={() => setMode(value)} className="accent-[var(--marteo-accent)]" />
                                {label}
                            </label>
                        ))}
                        {mode === "custom" && (
                            <input inputMode="decimal" placeholder={`1 ${currency} = ? ₾`} value={customRate} onChange={(event) => setCustomRate(event.target.value)} className={inputClass} />
                        )}
                        {mode === "paidGel" && (
                            <input inputMode="decimal" placeholder="თანხა ლარში, ₾" value={paidGel} onChange={(event) => setPaidGel(event.target.value)} className={inputClass} />
                        )}
                        {rateInfo.label && <p className="text-xs text-text-secondary">{rateInfo.label}</p>}
                        {conversion && (
                            <p className="text-sm font-semibold">
                                {money(foreignTotal)} {currency} → {money(conversion.targetGel)} ₾
                            </p>
                        )}
                    </div>
                )}

                {draft.extraAmounts.map((extra, index) => (
                    <Field key={`${extra.row}-${index}`} label={`ფაილში: ${extra.label}, ${money(extra.amount)} ${currency}`}>
                        <select
                            value={extras[index]}
                            onChange={(event) => setExtras((current) => current.map((kind, position) => position === index ? event.target.value as ExtraKind : kind))}
                            className={inputClass}
                        >
                            <option value="" disabled>აირჩიე, რა არის ეს თანხა</option>
                            <option value="shipping">ტრანსპორტირება</option>
                            <option value="customs">განბაჟება</option>
                            <option value="other">სხვა ხარჯი</option>
                            <option value="ignore">არ ჩავთვალო</option>
                        </select>
                    </Field>
                ))}

                {products && (
                    <div className="grid grid-cols-[1fr_96px] gap-2">
                        <Field label="გასაყიდი ფასი">
                            <select value={pricingMethod} onChange={(event) => setPricingMethod(event.target.value as typeof pricingMethod)} className={inputClass}>
                                <option value="MARKUP_PERCENT">ფასნამატი, %</option>
                                <option value="MARGIN_PERCENT">მარჟა, %</option>
                                <option value="FIXED_PROFIT">ფიქსირებული მოგება, ₾</option>
                            </select>
                        </Field>
                        <Field label={pricingMethod === "FIXED_PROFIT" ? "₾" : "%"}>
                            <input inputMode="decimal" value={pricingValue} onChange={(event) => setPricingValue(event.target.value)} placeholder="მაგ. 100" className={inputClass} />
                        </Field>
                    </div>
                )}
            </fieldset>

            <div>
                <button
                    type="button"
                    onClick={() => setShowItems((current) => !current)}
                    aria-expanded={showItems}
                    className="flex w-full items-center justify-between rounded-lg py-1 text-left text-sm font-medium text-accent"
                >
                    {products ? "პროდუქტების" : "მასალების"} სია ({draft.items.length})
                    <Icon icon="solar:alt-arrow-down-linear" className={`h-4 w-4 transition-transform ${showItems ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                {showItems && (
                    <ul className="mt-1 flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-xl ring-1 ring-inset ring-border">
                        {draft.items.map((item, index) => (
                            <li key={`${item.row}-${index}`} className="flex flex-col gap-0.5 px-2.5 py-2">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 font-medium">
                                        {!item.checked && <span title="ციფრები ფაილს ვერ შევადარე" className="mr-1">⚠️</span>}
                                        {item.name}
                                        {[item.color, item.size].some(Boolean) && (
                                            <span className="font-normal text-text-secondary"> · {[item.color, item.size].filter(Boolean).join(", ")}</span>
                                        )}
                                    </span>
                                    <span className="shrink-0 text-xs text-text-secondary">
                                        {item.quantity} {products ? "ც" : unitLabel(item.unit)} × {conversion ? `${money(conversion.units[index])} ₾` : `${price(item)} ${currency}`}
                                    </span>
                                </div>
                                <span className="truncate text-xs text-text-secondary" title={item.originalName}>{item.originalName}</span>
                                <span className="text-[11px] text-text-secondary">
                                    {item.category}
                                    {" · "}
                                    {products
                                        ? item.existingVariant ? "არსებულ მარაგს დაემატება" : item.sourceInventoryItemId ? "არსებული პროდუქტის ახალი ვარიანტი" : "ახალი პროდუქტი"
                                        : item.materialId ? "არსებულ მასალას დაემატება" : "ახალი მასალა"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {message.draftSaved ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <Icon icon="solar:check-circle-bold" className="h-5 w-5" aria-hidden="true" />
                    შენახულია
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {conversion && (
                        <p className="text-xs text-text-secondary">
                            სულ: {money(conversion.productsGel)} ₾
                            {conversion.costs.shipping + conversion.costs.customs + conversion.costs.other + conversion.rounding > 0 &&
                                ` + ხარჯები ${money(conversion.costs.shipping + conversion.costs.customs + conversion.costs.other + conversion.rounding)} ₾`}
                        </p>
                    )}
                    {problems.length > 0 && <p className="text-xs text-text-secondary">{problems[0]}</p>}
                    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
                    <button
                        type="button"
                        onClick={save}
                        disabled={!conversion || problems.length > 0 || saving}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? "ინახება…" : "შესყიდვის შენახვა"}
                    </button>
                </div>
            )}
        </div>
    );
}
