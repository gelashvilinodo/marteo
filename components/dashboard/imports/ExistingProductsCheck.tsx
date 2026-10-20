"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
    readProductCheckResponse,
} from "@/lib/imports/read-product-check-response";
import type {
    ImportProductCheckSnapshot,
    ProductComparisonField,
    ProductMatchQuery,
    ProductMatchResult,
} from "@/lib/imports/match-import-products";
import {
    productMatchQueryToken,
    type ImportExistingProductLink,
    type ImportExistingProductLinks,
} from "@/lib/imports/product-import-links";

type Props = {
    autoCheck?: boolean;
    queries: ProductMatchQuery[];
    links: ImportExistingProductLinks;
    onLinkChange: (
        key: string,
        link: ImportExistingProductLink | null,
    ) => void;
    labels: Record<string, string>;
    onChecked: (snapshot: ImportProductCheckSnapshot | null) => void;
};

const fieldLabels: Record<ProductComparisonField, string> = {
    name: "სახელი",
    brand: "ბრენდი",
    color: "ფერი",
    size: "ზომა",
};

const reasonLabels = {
    CODE: "ფაილის კოდი MARTEO-ს SKU-ს ემთხვევა",
    NAME_AND_ATTRIBUTES: "სახელი და ვარიანტის მახასიათებლები ემთხვევა",
    NAME: "პროდუქტის სახელი ემთხვევა",
} as const;

function CheckSession({
    queries,
    labels,
    onChecked,
    links,
    onLinkChange,
    autoCheck = false,
}: Props) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [snapshot, setSnapshot] =
        useState<ImportProductCheckSnapshot | null>(null);
    const [error, setError] = useState("");

    const controller = useRef<AbortController | null>(null);
    const running = useRef(false);

    useEffect(() => {
        onChecked(null);

        return () => {
            controller.current?.abort();
            onChecked(null);
        };
    }, [onChecked]);

    async function check() {
        if (running.current) return;

        running.current = true;

        const abort = new AbortController();
        controller.current = abort;

        setBusy(true);
        setProgress(0);
        setSnapshot(null);
        setError("");
        onChecked(null);

        try {
            let businessId: string | null = null;
            const results: ProductMatchResult[] = [];

            for (let offset = 0; offset < queries.length; offset += 100) {
                const batch = queries.slice(offset, offset + 100);

                const response = await fetch("/api/imports/products/check", {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: abort.signal,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ queries: batch }),
                });

                const raw: unknown = await response.json();

                if (!response.ok) {
                    const message =
                        typeof raw === "object" &&
                            raw !== null &&
                            "message" in raw &&
                            typeof raw.message === "string"
                            ? raw.message
                            : "პროდუქტების შემოწმება ვერ დასრულდა.";

                    throw new Error(message);
                }

                const parsed = readProductCheckResponse(raw, batch);

                if (
                    businessId !== null &&
                    businessId !== parsed.businessId
                ) {
                    throw new Error(
                        "შემოწმებისას ბიზნესი შეიცვალა. დაიწყე თავიდან.",
                    );
                }

                businessId = parsed.businessId;
                results.push(...parsed.results);

                if (abort.signal.aborted) return;

                setProgress(offset + batch.length);
            }

            if (!businessId) {
                throw new Error("შემოწმების ბიზნესი ვერ დადასტურდა.");
            }

            if (abort.signal.aborted) return;

            const completed: ImportProductCheckSnapshot = {
                businessId,
                queries,
                results,
                checkedAt: new Date().toISOString(),
            };

            setSnapshot(completed);
            onChecked(completed);
        } catch (cause: unknown) {
            if (!abort.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "შემოწმება ვერ დასრულდა.",
                );
            }
        } finally {
            running.current = false;

            if (!abort.signal.aborted) setBusy(false);
        }
    }

    const byKey = new Map(queries.map(query => [query.key, query]));
    const matchedResults = snapshot?.results.filter(
        result => result.candidates.length > 0,
    ) ?? [];

    const unmatchedCount = snapshot?.results.filter(
        result => result.complete && result.candidates.length === 0,
    ).length ?? 0;

    const incompleteCount = snapshot?.results.filter(
        result => !result.complete,
    ).length ?? 0;

    const startCheck = useEffectEvent(() => { void check(); });
    useEffect(() => {
        if (!autoCheck) return;
        let active = true;
        queueMicrotask(() => { if (active) startCheck(); });
        return () => { active = false; };
    }, [autoCheck]);

    return (
        <section className="space-y-3 border-t border-border pt-4">
            <h3 className="font-semibold">
                MARTEO-ში არსებულ პროდუქტებთან შედარება
            </h3>

            <button
                type="button"
                disabled={busy}
                onClick={() => void check()}
                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
            >
                {busy
                    ? "მოწმდება…"
                    : snapshot
                        ? "ხელახლა შემოწმება"
                        : "არსებული პროდუქტების შემოწმება"}
            </button>

            {busy && (
                <p role="status" className="text-sm text-text-secondary">
                    შემოწმებულია {progress} / {queries.length} ჩანაწერი.
                </p>
            )}

            {error && (
                <div role="alert" className="space-y-1 text-sm">
                    <p className="text-danger">{error}</p>
                    <p className="text-text-secondary">
                        ეს ფაილის შეცდომას არ ნიშნავს.
                        მონაცემები არ შეცვლილა.
                    </p>
                </div>
            )}

            {snapshot && (
                <div className="max-h-[40rem] space-y-4 overflow-y-auto">
                    {unmatchedCount > 0 && (
                        <p role="status" className="text-sm text-text-secondary">
                            {matchedResults.length === 0 && incompleteCount === 0
                                ? "დამთხვევა ვერ მოიძებნა."
                                : `${unmatchedCount} ჩანაწერზე დამთხვევა ვერ მოიძებნა.`}
                        </p>
                    )}

                    {incompleteCount > 0 && (
                        <p role="alert" className="text-sm text-danger">
                            {incompleteCount} ჩანაწერის შედარება არასრულია:
                            კანდიდატები სრულად ვერ გამოჩნდა.
                            ამ ჩანაწერებზე დამთხვევის არარსებობა
                            დადასტურებული არ არის.
                        </p>
                    )}

                    {matchedResults.map(result => {
                        const query = byKey.get(result.key);
                        const savedLink = links[result.key];
                        const createSelected =
                            query !== undefined &&
                            savedLink?.action === "CREATE" &&
                            savedLink.businessId === snapshot.businessId &&
                            savedLink.queryToken === productMatchQueryToken(query);

                        return (
                            <article
                                key={result.key}
                                className="space-y-3 rounded-xl border border-border p-3 text-sm"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {query?.name}
                                    </p>
                                    <p className="break-words text-text-secondary">
                                        {labels[result.key]}
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={!query || !result.complete || createSelected}
                                                onClick={() => {
                                                    if (!query) return;

                                                    onLinkChange(result.key, {
                                                        action: "CREATE",
                                                        businessId: snapshot.businessId,
                                                        queryToken: productMatchQueryToken(query),
                                                        acknowledgedCandidates: true,
                                                    });
                                                }}
                                                className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                                            >
                                                {createSelected
                                                    ? "ცალკე ახალი პროდუქტის შექმნა არჩეულია"
                                                    : "ეს სხვა პროდუქტია — ახლის შექმნა"}
                                            </button>

                                            {savedLink && (
                                                <button
                                                    type="button"
                                                    onClick={() => onLinkChange(result.key, null)}
                                                    className="min-h-11 rounded-xl border border-border px-3 text-sm"
                                                >
                                                    არჩევანის გაუქმება
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-xs text-text-secondary">
                                            თუ ქვემოთ ნაჩვენები ვარიანტები ამ პროდუქტს
                                            არ შეესაბამება, აირჩიე ცალკე შექმნა.
                                            MARTEO ახალ კოდს მიანიჭებს.
                                            არსებული პროდუქტები უცვლელი დარჩება.
                                        </p>
                                    </div>
                                </div>

                                {!result.complete && (
                                    <p className="text-danger">
                                        კანდიდატები სრულად ვერ გამოჩნდა.
                                        ამ შედეგით ვერ დავასკვნით, რომ
                                        პროდუქტი ახალია. საჭიროა
                                        დამატებითი ძებნა ან დაზუსტება.
                                    </p>
                                )}

                                {result.candidates.map(candidate => {
                                    const item = candidate.existing;

                                    const selected =
                                        query !== undefined &&
                                        savedLink?.action === "LINK" &&
                                        savedLink.queryToken === productMatchQueryToken(query) &&
                                        savedLink.businessId === snapshot.businessId &&
                                        savedLink.inventoryItemId === item.inventoryItemId &&
                                        savedLink.productId === item.productId &&
                                        savedLink.inventoryUpdatedAt === item.inventoryUpdatedAt &&
                                        savedLink.productUpdatedAt === item.productUpdatedAt;

                                    const hasDifferences =
                                        candidate.conflictingFields.length > 0 ||
                                        candidate.unspecifiedFields.length > 0;

                                    return (
                                        <div
                                            key={item.inventoryItemId}
                                            className="space-y-2 rounded-xl border border-border p-3"
                                        >
                                            <p className="font-semibold">
                                                {item.name}
                                            </p>

                                            <p className="text-text-secondary">
                                                {reasonLabels[candidate.reason]}
                                            </p>

                                            <p>MARTEO-ს კოდი: {item.sku}</p>

                                            <p>
                                                ბრენდი: {item.brand || "არ არის მითითებული"}
                                                {" · "}ფერი: {item.color || "არ არის მითითებული"}
                                                {" · "}ზომა: {item.size || "არ არის მითითებული"}
                                            </p>

                                            <p>
                                                მიმდინარე ნაშთი: {item.currentStock}
                                                {" · "}გასაყიდი ფასი:{" "}
                                                {item.salePrice ?? "არ არის მითითებული"}
                                            </p>

                                            {!item.isActive && (
                                                <p className="text-text-secondary">
                                                    ვარიანტი არააქტიურია.
                                                    ავტომატურად არ გააქტიურდება.
                                                </p>
                                            )}

                                            {candidate.conflictingFields.length > 0 && (
                                                <p className="text-danger">
                                                    განსხვავდება:{" "}
                                                    {candidate.conflictingFields
                                                        .map(field => fieldLabels[field])
                                                        .join(", ")}.
                                                </p>
                                            )}

                                            {candidate.unspecifiedFields.length > 0 && (
                                                <p className="text-text-secondary">
                                                    იმპორტის ჩანაწერში აკლია:{" "}
                                                    {candidate.unspecifiedFields
                                                        .map(field => fieldLabels[field])
                                                        .join(", ")}.
                                                    დაკავშირებამდე გადაამოწმე.
                                                </p>
                                            )}

                                            <button
                                                type="button"
                                                disabled={
                                                    !query ||
                                                    !result.complete ||
                                                    !item.isActive ||
                                                    selected
                                                }
                                                onClick={() => {
                                                    if (!query) return;

                                                    onLinkChange(result.key, {
                                                        action: "LINK",
                                                        businessId: snapshot.businessId,
                                                        queryToken: productMatchQueryToken(query),
                                                        inventoryItemId: item.inventoryItemId,
                                                        productId: item.productId,
                                                        inventoryUpdatedAt: item.inventoryUpdatedAt,
                                                        productUpdatedAt: item.productUpdatedAt,
                                                        acknowledgedDifferences: hasDifferences,
                                                    });
                                                }}
                                                className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                                            >
                                                {selected
                                                    ? "ამ ვარიანტთან კავშირი არჩეულია"
                                                    : hasDifferences
                                                        ? "განსხვავებები გადავამოწმე — დაკავშირება"
                                                        : "ამ ვარიანტთან დაკავშირება"}
                                            </button>

                                            <p className="text-xs text-text-secondary">
                                                არსებული პროდუქტის სახელი, მახასიათებლები,
                                                ფასი და მარაგი უცვლელი დარჩება.
                                                მარაგის გადმოტანის წესი ცალკე განისაზღვრება.
                                            </p>
                                        </div>
                                    );
                                })}
                            </article>
                        );
                    })}
                </div>
            )}

            <p className="text-xs text-text-secondary">
                კანდიდატის ჩვენება დაკავშირებას არ ნიშნავს.
                ფასები და მარაგები არ იცვლება.
            </p>
        </section>
    );
}

export default function ExistingProductsCheck(props: Props) {
    const queries = [...props.queries].sort(
        (left, right) => left.key.localeCompare(right.key),
    );

    if (queries.length === 0) return null;

    return (
        <CheckSession
            key={JSON.stringify(queries)}
            {...props}
            queries={queries}
        />
    );
}