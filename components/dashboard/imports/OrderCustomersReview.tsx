"use client";

import { useEffect, useRef, useState } from "react";
import {
    prepareOrderCustomers,
    type OrderCustomerCandidate,
} from "@/lib/imports/prepare-order-customers";
import type {
    PreparedDraftOrder,
} from "@/lib/imports/prepare-draft-orders";
import {
    getOrderCustomerDecisionToken,
    type OrderCustomerDecision,
    type OrderCustomerDecisions,
} from "@/lib/imports/order-customer-decisions";
import type {
    ImportCustomerCheckSnapshot,
} from "@/lib/imports/import-types";
import {
    runImportCustomerCheck,
} from "@/lib/imports/run-import-customer-check";
import OrderCustomerChoices from "./OrderCustomerChoices";

type DecisionChange = (
    phone: string,
    decision: OrderCustomerDecision | null,
) => void;

function ReviewSession({
    candidates,
    decisions,
    onDecisionChange,
}: {
    candidates: OrderCustomerCandidate[];
    decisions: OrderCustomerDecisions;
    onDecisionChange: DecisionChange;
}) {
    const [snapshot, setSnapshot] =
        useState<ImportCustomerCheckSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    const phones = candidates.map(candidate => candidate.phone).sort();

    async function check(retryFailed = false) {
        if (controller.current) return;

        const current = new AbortController();
        controller.current = current;
        setBusy(true);
        setError("");

        if (!retryFailed) setSnapshot(null);

        try {
            const result = await runImportCustomerCheck({
                phones,
                previous: retryFailed ? snapshot : null,
                signal: current.signal,
                onProgress: next => {
                    if (mounted.current && !current.signal.aborted) {
                        setSnapshot(next);
                    }
                },
            });

            if (mounted.current && !current.signal.aborted) {
                setSnapshot(result.snapshot);
                setError(result.message);
            }
        } catch (cause: unknown) {
            if (mounted.current && !current.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "მომხმარებლების შემოწმება ვერ დასრულდა.",
                );
            }
        } finally {
            if (controller.current === current) {
                controller.current = null;
                if (mounted.current) setBusy(false);
            }
        }
    }

    const checkedPhones = new Set(snapshot?.checkedPhones ?? []);

    const checkedCandidates = candidates
        .filter(candidate => checkedPhones.has(candidate.phone))
        .map(candidate => ({
            ...candidate,
            matches: (snapshot?.matches ?? []).filter(
                match => match.normalizedPhone === candidate.phone,
            ),
        }));

    return (
        <section className="space-y-3 rounded-xl border border-border p-3">
            <h3 className="text-sm font-semibold">
                შეკვეთების მომხმარებლების გადამოწმება
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
                      : "არსებულ მომხმარებლებთან შედარება"}
            </button>

            {!snapshot && !busy && !error && (
                <p className="text-sm text-text-secondary">
                    მომხმარებლებთან დამთხვევა ჯერ არ შემოწმებულა.
                </p>
            )}

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {snapshot && snapshot.failedPhones.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm text-danger">
                        {snapshot.failedPhones.length} ნომრის
                        შემოწმება ვერ დასრულდა.
                    </p>
                    <p className="break-words text-xs text-text-secondary">
                        {snapshot.failedPhones.join(", ")}
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void check(true)}
                        className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                    >
                        მხოლოდ შეუმოწმებელი ნომრების ხელახლა ცდა
                    </button>
                </div>
            )}

            {snapshot?.businessId && (
                <fieldset
                    disabled={busy}
                    className="min-w-0 border-0 p-0"
                >
                    <OrderCustomerChoices
                        businessId={snapshot.businessId}
                        candidates={checkedCandidates}
                        decisions={decisions}
                        onChange={onDecisionChange}
                    />
                </fieldset>
            )}

            <p className="text-xs text-text-secondary">
                ეს შემოწმება მომხმარებლებს არ ქმნის და არ ცვლის.
                შენახვამდე დამთხვევები სერვერზე ხელახლა შემოწმდება.
            </p>
        </section>
    );
}

export default function OrderCustomersReview({
    orders,
    decisions,
    onDecisionChange,
}: {
    orders: readonly PreparedDraftOrder[];
    decisions: OrderCustomerDecisions;
    onDecisionChange: DecisionChange;
}) {
    const prepared = prepareOrderCustomers(orders);

    if (prepared.candidates.length === 0) return null;

    const sourceKey = JSON.stringify(
        prepared.candidates
            .map(getOrderCustomerDecisionToken)
            .sort(),
    );

    return (
        <ReviewSession
            key={sourceKey}
            candidates={prepared.candidates}
            decisions={decisions}
            onDecisionChange={onDecisionChange}
        />
    );
}