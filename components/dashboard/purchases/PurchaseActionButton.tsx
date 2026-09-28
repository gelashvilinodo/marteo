"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

type Props = {
    purchaseId: string;
    purchaseNumber: number;
    receiptStatus: "IN_TRANSIT" | "RECEIVED";
    archived: boolean;
};

const actions = {
    delete: {
        label: "წაშლა",
        icon: "solar:trash-bin-trash-linear",
        message:
            "პარტია და მასში შეყვანილი სტრიქონები წაიშლება. მოქმედების დაბრუნება შეუძლებელია.",
    },
    archive: {
        label: "დაარქივება",
        icon: "solar:archive-down-linear",
        message:
            "პარტია არქივში გადავა. მარაგები და ფინანსური მონაცემები უცვლელი დარჩება.",
    },
    restore: {
        label: "აღდგენა",
        icon: "solar:archive-up-linear",
        message:
            "პარტია აქტიურ სიაში დაბრუნდება.",
    },
} as const;

export default function PurchaseActionButton({
    purchaseId,
    purchaseNumber,
    receiptStatus,
    archived,
}: Props) {
    const router = useRouter();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const requestLocked = useRef(false);
    const titleId = useId();
    const descriptionId = useId();

    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    const action = archived
        ? "restore"
        : receiptStatus === "IN_TRANSIT"
          ? "delete"
          : "archive";

    const config = actions[action];
    const isDelete = action === "delete";
    const number = String(purchaseNumber).padStart(3, "0");

    function openDialog() {
        if (requestLocked.current) return;

        setError("");
        dialogRef.current?.showModal();
    }

    function closeDialog() {
        if (requestLocked.current) return;

        dialogRef.current?.close();
    }

    async function confirmAction() {
        if (requestLocked.current) return;

        requestLocked.current = true;
        setPending(true);
        setError("");

        try {
            const response = await fetch(
                `/api/purchases/${encodeURIComponent(purchaseId)}/actions/${action}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                },
            );

            const raw: unknown = await response.json().catch(() => null);

            const body =
                typeof raw === "object" &&
                raw !== null &&
                !Array.isArray(raw)
                    ? (raw as Record<string, unknown>)
                    : null;

            if (!response.ok || body?.success !== true) {
                throw new Error(
                    typeof body?.error === "string"
                        ? body.error
                        : "მოქმედების შედეგი ვერ დადასტურდა. განაახლე სია და გადაამოწმე პარტია.",
                );
            }

            dialogRef.current?.close();
            router.refresh();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "მოქმედება ვერ შესრულდა.",
            );
        } finally {
            requestLocked.current = false;
            setPending(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                disabled={pending}
                aria-label={`პარტია #${number} — ${config.label}`}
                title={config.label}
                className={[
                    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border transition",
                    "disabled:cursor-wait disabled:opacity-60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    isDelete
                        ? "text-red-500 hover:border-red-500 hover:bg-red-500/10"
                        : "text-text-secondary hover:border-accent hover:bg-accent/10 hover:text-accent",
                ].join(" ")}
            >
                <Icon
                    icon={
                        pending
                            ? "solar:refresh-linear"
                            : config.icon
                    }
                    className={[
                        "h-5 w-5",
                        pending
                            ? "animate-spin motion-reduce:animate-none"
                            : "",
                    ].join(" ")}
                    aria-hidden="true"
                />
            </button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                aria-busy={pending}
                onCancel={(event) => {
                    if (requestLocked.current) {
                        event.preventDefault();
                    }
                }}
                className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-xl backdrop:bg-black/45"
            >
                <h2
                    id={titleId}
                    className="text-lg font-semibold"
                >
                    პარტია #{number} — {config.label}
                </h2>

                <p
                    id={descriptionId}
                    className="mt-3 text-sm leading-relaxed text-text-secondary"
                >
                    {config.message}
                </p>

                {error && (
                    <p
                        role="alert"
                        className="mt-3 text-sm text-red-500"
                    >
                        {error}
                    </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        autoFocus
                        onClick={closeDialog}
                        disabled={pending}
                        className="min-h-11 min-w-0 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-background disabled:opacity-50"
                    >
                        გაუქმება
                    </button>

                    <button
                        type="button"
                        onClick={() => void confirmAction()}
                        disabled={pending}
                        className={[
                            "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60",
                            isDelete
                                ? "bg-red-600 text-white hover:bg-red-700"
                                : "bg-accent text-white hover:bg-accent-hover",
                        ].join(" ")}
                    >
                        {pending && (
                            <Icon
                                icon="solar:refresh-linear"
                                className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        )}

                        {pending ? "მიმდინარეობს…" : config.label}
                    </button>
                </div>
            </dialog>
        </>
    );
}