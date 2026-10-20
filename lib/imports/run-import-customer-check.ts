"use client";

import type {
    ImportCustomerCheckSnapshot,
    ImportExistingCustomerMatch,
} from "./import-types";

function isMatch(value: unknown): value is ImportExistingCustomerMatch {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return false;
    }

    const item = value as Record<string, unknown>;

    return (
        typeof item.id === "string" &&
        typeof item.phone === "string" &&
        typeof item.normalizedPhone === "string" &&
        typeof item.updatedAt === "string" &&
        Number.isFinite(Date.parse(item.updatedAt)) &&
        ["firstName", "lastName", "address", "deletedAt"].every(
            field =>
                item[field] === null ||
                typeof item[field] === "string",
        )
    );
}

export async function runImportCustomerCheck({
    phones,
    previous,
    signal,
    onProgress,
}: {
    phones: string[];
    previous: ImportCustomerCheckSnapshot | null;
    signal: AbortSignal;
    onProgress: (snapshot: ImportCustomerCheckSnapshot) => void;
}): Promise<{
    snapshot: ImportCustomerCheckSnapshot;
    message: string;
}> {
    const sameRequest =
        previous !== null &&
        JSON.stringify(previous.requestedPhones) === JSON.stringify(phones);

    const saved = sameRequest ? previous : null;
    const targets = saved ? saved.failedPhones : phones;

    let businessId = saved?.businessId ?? null;
    let matches = [...(saved?.matches ?? [])];

    const checked = new Set(saved?.checkedPhones ?? []);
    const failed = new Set(saved?.failedPhones ?? []);
    let lastError = "";

    function snapshot(): ImportCustomerCheckSnapshot {
        return {
            businessId,
            requestedPhones: [...phones],
            checkedPhones: phones.filter(phone => checked.has(phone)),
            failedPhones: phones.filter(phone => failed.has(phone)),
            matches: [...matches],
            checkedAt: new Date().toISOString(),
        };
    }

    onProgress(snapshot());

    for (let offset = 0; offset < targets.length; offset += 500) {
        if (signal.aborted) {
            throw new DOMException("შემოწმება გაუქმდა.", "AbortError");
        }

        const batch = targets.slice(offset, offset + 500);
        let sessionInvalid = false;

        try {
            const response = await fetch("/api/imports/customers/check", {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ phones: batch }),
            });

            if (response.status === 401 || response.status === 403) {
                sessionInvalid = true;
            }

            const raw: unknown = await response.json();

            if (
                typeof raw !== "object" ||
                raw === null ||
                Array.isArray(raw)
            ) {
                throw new Error("შემოწმების პასუხი ვერ წავიკითხეთ.");
            }

            const body = raw as Record<string, unknown>;

            if (!response.ok || body.success !== true) {
                throw new Error(
                    typeof body.message === "string"
                        ? body.message
                        : "მოთხოვნის შემოწმება ვერ დასრულდა.",
                );
            }

            if (
                typeof body.businessId !== "string" ||
                !body.businessId ||
                !Array.isArray(body.checkedPhones) ||
                body.checkedPhones.length !== batch.length ||
                !batch.every(
                    (phone, index) =>
                        Array.isArray(body.checkedPhones) &&
                        body.checkedPhones[index] === phone,
                ) ||
                !Array.isArray(body.matches) ||
                !body.matches.every(isMatch)
            ) {
                throw new Error(
                    "შემოწმების პასუხი არასრულია. ეს ნაწილი დაუდასტურებელი დარჩა.",
                );
            }

            if (
                businessId !== null &&
                businessId !== body.businessId
            ) {
                sessionInvalid = true;

                throw new Error(
                    "აქტიური ბიზნესი შეიცვალა. საჭიროა სრული შემოწმება თავიდან.",
                );
            }

            const batchSet = new Set(batch);

            if (
                body.matches.some(
                    match => !batchSet.has(match.normalizedPhone),
                )
            ) {
                throw new Error(
                    "პასუხი მოთხოვნილ ნომრებს არ შეესაბამება.",
                );
            }

            businessId = body.businessId;

            matches = [
                ...matches.filter(
                    match => !batchSet.has(match.normalizedPhone),
                ),
                ...body.matches,
            ];

            for (const phone of batch) {
                checked.add(phone);
                failed.delete(phone);
            }
        } catch (cause: unknown) {
            if (signal.aborted) throw cause;

            lastError = cause instanceof Error
                ? cause.message
                : "შემოწმება ვერ დასრულდა.";

            if (sessionInvalid) {
                businessId = null;
                matches = [];
                checked.clear();
                failed.clear();

                for (const phone of phones) failed.add(phone);

                onProgress(snapshot());
                break;
            }

            for (const phone of batch) {
                checked.delete(phone);
                failed.add(phone);
            }
        }

        if (!signal.aborted) onProgress(snapshot());
    }

    return {
        snapshot: snapshot(),
        message: failed.size > 0
            ? lastError || "ნაწილის შემოწმება ვერ დადასტურდა."
            : "",
    };
}