"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { refreshPurchasesAfterMutation } from "@/lib/purchases/refresh-purchases-client";

type Props = {
    purchaseId: string;
    purchaseNumber: number;
    receiptStatus: "IN_TRANSIT" | "RECEIVED";
    archived: boolean;
    action?: "delete" | "restore";
};

type DeleteImpact = {
    updatedAt: string;
    remainingQuantity: number;
    usedQuantity: number;
};

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export default function PurchaseActionButton({
    purchaseId,
    purchaseNumber,
    archived,
    action: selectedAction,
}: Props) {
    const router = useRouter();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const previewController = useRef<AbortController | null>(null);
    const requestLocked = useRef(false);

    const titleId = useId();
    const descriptionId = useId();

    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [impact, setImpact] = useState<DeleteImpact | null>(null);

    const action = selectedAction ?? (archived ? "restore" : "delete");
    const isDelete = action === "delete";
    const label = isDelete ? "წაშლა" : "აღდგენა";
    const number = String(purchaseNumber).padStart(3, "0");
    const endpoint =
        `/api/purchases/${encodeURIComponent(purchaseId)}/actions/${action}`;

    useEffect(() => {
        return () => previewController.current?.abort();
    }, []);

    function clearPreview() {
        previewController.current?.abort();
        previewController.current = null;
        setImpact(null);
        setLoading(false);
    }

    async function loadDeleteImpact() {
        if (requestLocked.current) return;

        previewController.current?.abort();

        const controller = new AbortController();
        previewController.current = controller;
        const timeout = setTimeout(() => controller.abort(), 20000);

        setLoading(true);
        setImpact(null);
        setError("");

        try {
            const response = await fetch(endpoint, {
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal,
            });

            const body = record(
                await response.json().catch(() => null),
            );

            if (!response.ok || body?.success !== true) {
                throw new Error(
                    typeof body?.error === "string"
                        ? body.error
                        : "წაშლის მონაცემები ვერ ჩაიტვირთა.",
                );
            }

            const data = record(body.impact);

            if (
                !data ||
                data.id !== purchaseId ||
                data.number !== purchaseNumber ||
                typeof data.updatedAt !== "string" ||
                !Number.isFinite(Date.parse(data.updatedAt)) ||
                typeof data.remainingQuantity !== "number" ||
                !Number.isSafeInteger(data.remainingQuantity) ||
                data.remainingQuantity < 0 ||
                typeof data.usedQuantity !== "number" ||
                !Number.isSafeInteger(data.usedQuantity) ||
                data.usedQuantity < 0
            ) {
                throw new Error("წაშლის მონაცემები არასრულია.");
            }

            if (previewController.current !== controller) return;

            setImpact({
                updatedAt: data.updatedAt,
                remainingQuantity: data.remainingQuantity,
                usedQuantity: data.usedQuantity,
            });
        } catch (caught) {
            if (previewController.current !== controller) return;

            setError(
                controller.signal.aborted
                    ? "ჩატვირთვის დრო ამოიწურა. სცადე ხელახლა."
                    : caught instanceof Error
                        ? caught.message
                        : "მონაცემები ვერ ჩაიტვირთა.",
            );
        } finally {
            clearTimeout(timeout);

            if (previewController.current === controller) {
                previewController.current = null;
                setLoading(false);
            }
        }
    }

    function openDialog() {
        if (
            requestLocked.current ||
            previewController.current ||
            dialogRef.current?.open
        ) return;

        setError("");
        setImpact(null);
        dialogRef.current?.showModal();

        if (isDelete) void loadDeleteImpact();
    }

    function closeDialog() {
        if (requestLocked.current) return;

        clearPreview();
        dialogRef.current?.close();
    }

    async function confirmAction() {
        if (
            requestLocked.current ||
            loading ||
            (isDelete && !impact)
        ) return;

        requestLocked.current = true;
        setPending(true);
        setError("");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "same-origin",
                signal: controller.signal,
                ...(isDelete
                    ? {
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(impact),
                    }
                    : {}),
            });

            const body = record(
                await response.json().catch(() => null),
            );

            if (!response.ok || body?.success !== true) {
                throw new Error(
                    typeof body?.error === "string"
                        ? body.error
                        : "შედეგი ვერ დადასტურდა. განაახლე სია და გადაამოწმე პარტია.",
                );
            }

            dialogRef.current?.close();
            refreshPurchasesAfterMutation(() => router.refresh());
        } catch (caught) {
            // გაურკვეველი შედეგისას წაშლას ავტომატურად არ ვიმეორებთ.
            if (isDelete) setImpact(null);

            setError(
                controller.signal.aborted
                    ? "პასუხის მოლოდინის დრო ამოიწურა. განაახლე სია და გადაამოწმე, პარტია ხომ არ წაიშალა."
                    : caught instanceof Error
                        ? caught.message
                        : "შედეგი ვერ დადასტურდა. გადაამოწმე პარტია.",
            );
        } finally {
            clearTimeout(timeout);
            requestLocked.current = false;
            setPending(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                disabled={pending || loading}
                aria-label={`პარტია #${number} - ${label}`}
                title={label}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border transition disabled:opacity-50 ${
                    isDelete
                        ? "delete-action"
                        : "text-text-secondary hover:border-accent hover:text-accent"
                }`}
            >
                <Icon
                    icon={isDelete
                        ? "solar:trash-bin-trash-linear"
                        : "solar:archive-up-linear"}
                    className="h-5 w-5"
                    aria-hidden="true"
                />
            </button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                aria-busy={pending || loading}
                onClose={clearPreview}
                onCancel={event => {
                    if (requestLocked.current) event.preventDefault();
                }}
                className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-xl backdrop:bg-black/45"
            >
                <h2 id={titleId} className="text-lg font-semibold">
                    პარტია #{number} - {label}
                </h2>

                <p
                    id={descriptionId}
                    className="mt-3 text-sm leading-relaxed text-text-secondary"
                >
                    {isDelete
                        ? "პარტია და მისი ჩანაწერები სრულად წაიშლება. მოქმედების გაუქმება შეუძლებელია."
                        : "პარტია აქტიურ სიაში დაბრუნდება."}
                </p>

                {isDelete && loading && (
                    <p role="status" className="mt-3 text-sm text-text-secondary">
                        რაოდენობები მოწმდება…
                    </p>
                )}

                {isDelete && impact && (
                    <div className="mt-3 min-w-0 rounded-xl border border-border bg-background p-3 text-sm">
                        <dl className="space-y-2">
                            <div className="flex justify-between gap-3">
                                <dt>შეკვეთებისთვის გამოყენებული</dt>
                                <dd className="shrink-0 font-semibold">
                                    {impact.usedQuantity}
                                </dd>
                            </div>

                            <div className="flex justify-between gap-3">
                                <dt>მარაგიდან მოსახსნელი</dt>
                                <dd className="shrink-0 font-semibold">
                                    {impact.remainingQuantity}
                                </dd>
                            </div>
                        </dl>

                        <p className="mt-3 leading-relaxed text-text-secondary">
                            არსებული შეკვეთები, გაყიდვების თანხები და მათში
                            შენახული თვითღირებულება შენარჩუნდება და კვლავ
                            მონაწილეობას მიიღებს ანალიტიკაში.
                        </p>
                    </div>
                )}

                {error && (
                    <p role="alert" className="mt-3 text-sm text-red-500">
                        {error}
                    </p>
                )}

                {isDelete && !impact && !loading && (
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => void loadDeleteImpact()}
                        className="mt-3 min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                    >
                        რაოდენობების განახლება
                    </button>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        autoFocus
                        disabled={pending}
                        onClick={closeDialog}
                        className="min-h-11 min-w-0 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50"
                    >
                        გაუქმება
                    </button>

                    <button
                        type="button"
                        disabled={pending || loading || (isDelete && !impact)}
                        onClick={() => void confirmAction()}
                        className={`min-h-11 min-w-0 rounded-xl px-3 text-sm font-medium text-white disabled:opacity-50 ${
                            isDelete
                                ? "delete-button"
                                : "bg-accent hover:bg-accent-hover"
                        }`}
                    >
                        {pending ? "მიმდინარეობს…" : label}
                    </button>
                </div>
            </dialog>
        </>
    );
}