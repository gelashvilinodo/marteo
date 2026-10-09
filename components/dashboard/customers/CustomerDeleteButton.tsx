"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

type Props = {
    ids: string[];
    onDeleted: () => void;
    onSuccess?: (message: string) => void;
    initialConfirming?: boolean;
    onBusyChange?: (busy: boolean) => void;
};

export default function CustomerDeleteButton({
    ids,
    onDeleted,
    onSuccess,
    initialConfirming = false,
    onBusyChange,
}: Props) {
    const router = useRouter();
    const busyRef = useRef(false);

    const [confirming, setConfirming] = useState(initialConfirming);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [uncertain, setUncertain] = useState(false);

    async function remove() {
        if (busyRef.current || uncertain || !ids.length) return;

        busyRef.current = true;
        setSaving(true);
        onBusyChange?.(true);
        setError("");

        try {
            const response = await fetch("/api/customers", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ids,
                    confirmDeletion: true,
                }),
            });

            const raw: unknown = await response.json();

            if (
                typeof raw !== "object" ||
                raw === null ||
                !("success" in raw) ||
                typeof raw.success !== "boolean"
            ) {
                throw new Error("სერვერის პასუხი არასწორია.");
            }

            const message =
                "message" in raw && typeof raw.message === "string"
                    ? raw.message
                    : "მომხმარებლის წაშლა ვერ მოხერხდა.";

            if (!response.ok || !raw.success) {
                if (response.status >= 500 || response.ok) {
                    setUncertain(true);
                }

                setError(message);
                return;
            }

            onSuccess?.(
                ids.length === 1
                    ? "მომხმარებელი წარმატებით წაიშალა."
                    : `${ids.length} მომხმარებელი წარმატებით წაიშალა.`,
            );

            router.refresh();
            onDeleted();
        } catch {
            setUncertain(true);
            setError(
                "წაშლის შედეგი ვერ დადასტურდა. გადაამოწმე მომხმარებლების სია.",
            );
        } finally {
            busyRef.current = false;
            setSaving(false);
            onBusyChange?.(false);
        }
    }

    if (!confirming) {
        return (
            <button
                type="button"
                disabled={!ids.length}
                onClick={() => setConfirming(true)}
                className={
                    "inline-flex items-center gap-2 rounded-xl " +
                    "border border-border px-4 py-3 text-sm " +
                    "text-red-400 transition hover:border-red-400 " +
                    "disabled:opacity-50"
                }
            >
                <Icon
                    icon="solar:trash-bin-trash-linear"
                    className="h-5 w-5"
                />

                წაშლა
            </button>
        );
    }

    return (
        <div className="w-full space-y-3 rounded-xl border border-border bg-background p-3">
            <p className="text-sm font-medium">
                {ids.length === 1
                    ? "წავშალოთ მომხმარებელი?"
                    : `წავშალოთ ${ids.length} მომხმარებელი?`}
            </p>

            <p className="text-xs leading-relaxed text-text-secondary">
                მომხმარებელი სიიდან გაქრება. არსებული შეკვეთები,
                მიმღების მონაცემები და შეკვეთების ისტორია შენარჩუნდება.
                ამ ნომრით ხელახლა დამატებისას ჩანაწერი აღდგება.
            </p>

            {error && (
                <p role="alert" className="text-sm text-warning">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                        if (uncertain) {
                            router.refresh();
                            onDeleted();
                            return;
                        }

                        if (initialConfirming) {
                            onDeleted();
                            return;
                        }

                        setConfirming(false);
                        setError("");
                    }}
                    className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
                >
                    {uncertain ? "სიის განახლება" : "გაუქმება"}
                </button>

                <button
                    type="button"
                    disabled={saving || uncertain}
                    onClick={() => void remove()}
                    className={
                        "inline-flex items-center gap-2 rounded-xl " +
                        "bg-red-500 px-4 py-2 text-sm font-semibold " +
                        "text-white disabled:opacity-50"
                    }
                >
                    <Icon
                        icon={
                            saving
                                ? "solar:refresh-linear"
                                : "solar:trash-bin-trash-linear"
                        }
                        className={`h-5 w-5 ${saving ? "animate-spin" : ""
                            }`}
                    />

                    {saving ? "იშლება…" : "წაშლის დადასტურება"}
                </button>
            </div>
        </div>
    );
}