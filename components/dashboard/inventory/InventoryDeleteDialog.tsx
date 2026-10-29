"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { getInventoryDeleteImpact } from "@/lib/inventory/get-inventory-delete-impact";

type Impact = Awaited<ReturnType<typeof getInventoryDeleteImpact>>;

type Props = {
    inventoryItemId: string;
    onClose: () => void;
    onDeleted: () => void;
};

type ApiResult = {
    success?: boolean;
    message?: string;
    data?: Impact;
};

const buttonClass =
    "min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function InventoryDeleteDialog({
    inventoryItemId,
    onClose,
    onDeleted,
}: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const locked = useRef(false);
    const requestRef = useRef<{
        requestId: string;
        expectedVersion: string;
    } | null>(null);

    const titleId = useId();
    const [impact, setImpact] = useState<Impact | null>(null);
    const [choice, setChoice] = useState<"mistake" | "writeoff" | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [needsReload, setNeedsReload] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState("");

    const endpoint =
        `/api/inventory/${encodeURIComponent(inventoryItemId)}/delete`;

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        if (!dialog.open) dialog.showModal();

        function warn(event: BeforeUnloadEvent) {
            if (!locked.current && !requestRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", warn);

        return () => {
            window.removeEventListener("beforeunload", warn);
            dialog.close();
            document.body.style.overflow = overflow;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const timer = setTimeout(() => controller.abort(), 20000);

        async function load() {
            setLoading(true);
            setError("");
            setChoice(null);
            setImpact(null);

            try {
                const response = await fetch(endpoint, {
                    cache: "no-store",
                    signal: controller.signal,
                });

                const result = await response.json() as ApiResult;

                if (
                    !response.ok ||
                    result?.success !== true ||
                    !result.data ||
                    typeof result.data.expectedVersion !== "string" ||
                    !Number.isSafeInteger(result.data.quantity) ||
                    !Array.isArray(result.data.purchases)
                ) {
                    throw new Error(
                        result?.message || "მარაგი ვერ ჩაიტვირთა.",
                    );
                }

                if (active) {
                    setImpact(result.data);
                    setNeedsReload(false);
                }
            } catch (cause) {
                if (active) {
                    setError(
                        controller.signal.aborted
                            ? "ჩატვირთვის დრო ამოიწურა. სცადე ხელახლა."
                            : cause instanceof Error
                                ? cause.message
                                : "მარაგი ვერ ჩაიტვირთა.",
                    );
                }
            } finally {
                clearTimeout(timer);
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [endpoint, attempt]);

    function requestClose() {
        if (locked.current) return;

        if (
            requestRef.current &&
            !window.confirm(
                "წაშლის შედეგი ჯერ დაუდასტურებელია. დახურვის შემდეგ გადაამოწმე მარაგი. დახურო ფანჯარა?",
            )
        ) {
            return;
        }

        onClose();
    }

    async function remove() {
        if (
            !impact ||
            locked.current ||
            needsReload ||
            (impact.quantity > 0 && choice !== "writeoff")
        ) {
            return;
        }

        const payload = requestRef.current ?? {
            requestId: crypto.randomUUID(),
            expectedVersion: impact.expectedVersion,
        };

        requestRef.current = payload;
        locked.current = true;
        setSaving(true);
        setError("");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 40000);
        let completed = false;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            const result = await response.json() as ApiResult;

            if (!response.ok || result?.success !== true) {
                if (
                    [400, 401, 403, 404, 409, 415, 422].includes(
                        response.status,
                    )
                ) {
                    requestRef.current = null;
                    setUncertain(false);
                    setNeedsReload(true);
                }

                throw new Error(
                    result?.message || "წაშლის შედეგი ვერ დადასტურდა.",
                );
            }

            requestRef.current = null;
            completed = true;
        } catch (cause) {
            setUncertain(requestRef.current !== null);
            setError(
                controller.signal.aborted
                    ? "წაშლის შედეგი დაუდასტურებელია. დააჭირე „შედეგის გადამოწმებას“ - იგივე მოქმედება ორჯერ არ შესრულდება."
                    : cause instanceof Error
                        ? cause.message
                        : "წაშლის შედეგი ვერ დადასტურდა.",
            );
        } finally {
            clearTimeout(timer);
            locked.current = false;
            setSaving(false);
        }

        if (completed) onDeleted();
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onCancel={event => {
                event.preventDefault();
                requestClose();
            }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
            <header className="flex items-center justify-between gap-3 border-b border-border p-4">
                <h2 id={titleId} className="font-semibold">
                    პროდუქტის წაშლა
                </h2>
                <button
                    type="button"
                    disabled={saving}
                    onClick={requestClose}
                    className={buttonClass}
                >
                    დახურვა
                </button>
            </header>

            <div className="min-w-0 space-y-4 p-4">
                {loading ? (
                    <p role="status" className="text-sm text-text-secondary">
                        იტვირთება…
                    </p>
                ) : impact ? (
                    <>
                        <div className="min-w-0">
                            <p className="break-words font-medium">
                                {impact.name}
                            </p>
                            <p className="mt-1 text-sm text-text-secondary">
                                {[impact.color, impact.size]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>

                        {impact.quantity === 0 ? (
                            <>
                                <p className="text-sm leading-relaxed text-text-secondary">
                                    პროდუქტი მარაგების სიიდან გაქრება.
                                    შესყიდვებისა და შეკვეთების ისტორია დარჩება.
                                    დამატებითი ხარჯი არ ჩაითვლება.
                                </p>
                                <button
                                    type="button"
                                    disabled={saving || needsReload}
                                    onClick={() => void remove()}
                                    className={`${buttonClass} delete-button w-full`}
                                >
                                    {saving
                                        ? "მიმდინარეობს…"
                                        : uncertain
                                            ? "შედეგის გადამოწმება"
                                            : "წაშლა"}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm">
                                    დარჩენილია:{" "}
                                    <strong>{impact.quantity} ერთეული</strong>
                                </p>

                                <p className="font-medium">
                                    რატომ შლი პროდუქტს?
                                </p>

                                <fieldset
                                    disabled={saving || uncertain || needsReload}
                                    className="space-y-3"
                                >
                                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
                                        <input
                                            type="radio"
                                            name={titleId}
                                            checked={choice === "mistake"}
                                            onChange={() => setChoice("mistake")}
                                            className="mt-1 accent-[var(--marteo-accent)]"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium">
                                                შეცდომით დავამატე
                                            </span>
                                            <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                                                გაასწორე პროდუქტი ან რაოდენობა
                                                შესყიდვაში. დამატებითი ხარჯი არ
                                                ჩაითვლება.
                                            </span>
                                        </span>
                                    </label>

                                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
                                        <input
                                            type="radio"
                                            name={titleId}
                                            checked={choice === "writeoff"}
                                            onChange={() => setChoice("writeoff")}
                                            className="mt-1 accent-[var(--marteo-accent)]"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium">
                                                მარაგი აღარ მაქვს
                                            </span>
                                            <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                                                დარჩენილი რაოდენობა ჩამოიწერება
                                                და მისი თვითღირებულება ხარჯად
                                                ჩაითვლება.
                                            </span>
                                        </span>
                                    </label>
                                </fieldset>

                                {choice === "mistake" && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-text-secondary">
                                            აირჩიე შესყიდვა და მის გვერდზე
                                            დააჭირე რედაქტირების ღილაკს.
                                        </p>

                                        {impact.purchases.map(purchase => {
                                            const params = new URLSearchParams({
                                                q: `#${purchase.number}`,
                                            });

                                            if (purchase.archived) {
                                                params.set("view", "archive");
                                            }

                                            return (
                                                <Link
                                                    key={purchase.id}
                                                    href={`/dashboard/purchases?${params}`}
                                                    prefetch={false}
                                                    onClick={onClose}
                                                    className={`${buttonClass} flex min-w-0 items-center justify-between gap-3`}
                                                >
                                                    <span className="min-w-0 break-words">
                                                        #{String(purchase.number).padStart(3, "0")}
                                                        {purchase.name
                                                            ? ` · ${purchase.name}`
                                                            : ""}
                                                    </span>
                                                    <span aria-hidden="true">→</span>
                                                </Link>
                                            );
                                        })}

                                        {impact.purchases.length === 0 && (
                                            <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
                                                დაკავშირებული შესყიდვა აღარ
                                                არსებობს. ამ ფანჯრიდან შესყიდვის
                                                შეცდომის გასწორება შეუძლებელია.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {choice === "writeoff" && (
                                    <div className="space-y-3">
                                        <p className="rounded-xl bg-warning/10 p-3 text-sm leading-relaxed">
                                            მარაგს მოაკლდება{" "}
                                            <strong>{impact.quantity} ერთეული</strong>.
                                            ხარჯად ჩაითვლება{" "}
                                            <strong>{impact.writeOffCost} ₾</strong>.
                                            ძველი შეკვეთები და შესყიდვების
                                            ისტორია დარჩება.
                                        </p>

                                        <button
                                            type="button"
                                            disabled={saving || needsReload}
                                            onClick={() => void remove()}
                                            className={`${buttonClass} delete-button w-full`}
                                        >
                                            {saving
                                                ? "მიმდინარეობს…"
                                                : uncertain
                                                    ? "შედეგის გადამოწმება"
                                                    : "ჩამოწერა და წაშლა"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                ) : null}

                {error && (
                    <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                {!loading && (!impact || needsReload) && (
                    <button
                        type="button"
                        onClick={() => setAttempt(value => value + 1)}
                        className={buttonClass}
                    >
                        მონაცემების განახლება
                    </button>
                )}
            </div>
        </dialog>
    );
}