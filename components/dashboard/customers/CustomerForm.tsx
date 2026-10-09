"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";

type Props = {
    customer: CustomerEntry | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
};

const inputClass =
    "h-11 w-full rounded-xl border border-border " +
    "bg-background px-3 text-[16px] text-text-primary " +
    "outline-none focus:border-accent";

export default function CustomerForm({
    customer,
    onClose,
    onSuccess,
}: Props) {
    const router = useRouter();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const submittingRef = useRef(false);

    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState("");
    const [uncertain, setUncertain] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;

        dialog?.showModal();

        return () => {
            dialog?.close();
        };
    }, []);

    useEffect(() => {
        if (!dirty) return;

        function beforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", beforeUnload);

        return () => {
            window.removeEventListener("beforeunload", beforeUnload);
        };
    }, [dirty]);

    function close() {
        if (submittingRef.current) return;

        const message = uncertain
            ? "შენახვის შედეგი უცნობია. დახურვის შემდეგ გადაამოწმე სია. დახურავ?"
            : "შეუნახავი ცვლილებები დაიკარგება. დახურავ?";

        if (
            (dirty || uncertain) &&
            !window.confirm(message)
        ) {
            return;
        }

        if (uncertain) router.refresh();

        onClose();
    }

    async function save(form: HTMLFormElement) {
        if (submittingRef.current || uncertain) return;

        const values = new FormData(form);

        submittingRef.current = true;
        setSaving(true);
        setError("");

        try {
            const response = await fetch("/api/customers", {
                method: customer ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...(customer ? { id: customer.id } : {}),
                    phone: String(values.get("phone") ?? ""),
                    firstName: String(values.get("firstName") ?? ""),
                    lastName: String(values.get("lastName") ?? ""),
                    address: String(values.get("address") ?? ""),
                }),
            });

            const raw: unknown = await response.json();

            if (
                typeof raw !== "object" ||
                raw === null ||
                !("success" in raw) ||
                typeof raw.success !== "boolean"
            ) {
                throw new Error("სერვერის პასუხის ფორმატი არასწორია.");
            }

            const result = {
                success: raw.success,
                message:
                    "message" in raw && typeof raw.message === "string"
                        ? raw.message
                        : "",
            };

            if (!response.ok || result.success !== true) {
                if (response.status >= 500 || response.ok) {
                    setUncertain(true);
                }

                setError(
                    result.message ||
                    "მომხმარებლის შენახვა ვერ მოხერხდა.",
                );
                return;
            }

            onSuccess(
                customer
                    ? "მომხმარებლის მონაცემები წარმატებით განახლდა."
                    : "მომხმარებელი წარმატებით დაემატა.",
            );

            router.refresh();
            onClose();
        } catch {
            setUncertain(true);
            setError(
                "შენახვის შედეგი ვერ დადასტურდა. დახურე ფანჯარა და გადაამოწმე სია ხელახლა დამატებამდე.",
            );
        } finally {
            submittingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="customer-form-title"
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
            className={
                "m-auto max-h-[90dvh] w-[calc(100%-2rem)] " +
                "max-w-lg overflow-y-auto rounded-2xl " +
                "border border-border bg-surface " +
                "text-text-primary shadow-2xl " +
                "backdrop:bg-black/30 backdrop:backdrop-blur-sm"
            }
        >
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <h2
                    id="customer-form-title"
                    className="flex items-center gap-2 font-semibold"
                >
                    <Icon
                        icon="solar:user-plus-rounded-linear"
                        className="h-6 w-6 text-accent"
                    />

                    {customer
                        ? "მომხმარებლის რედაქტირება"
                        : "ახალი მომხმარებელი"}
                </h2>

                <button
                    type="button"
                    disabled={saving}
                    onClick={close}
                    aria-label="დახურვა"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border disabled:opacity-50"
                >
                    <Icon
                        icon="solar:close-circle-linear"
                        className="h-6 w-6"
                    />
                </button>
            </div>

            <form
                className="space-y-4 p-4"
                onChange={() => setDirty(true)}
                onSubmit={(event) => {
                    event.preventDefault();
                    void save(event.currentTarget);
                }}
            >
                <fieldset
                    disabled={saving || uncertain}
                    className="space-y-4 disabled:opacity-60"
                >
                    <label className="block space-y-1">
                        <span className="text-sm text-text-secondary">
                            ტელეფონი *
                        </span>

                        <input
                            type="tel"
                            name="phone"
                            autoComplete="tel"
                            required
                            autoFocus
                            defaultValue={customer?.phone ?? ""}
                            placeholder="მაგ: 599 12 34 56"
                            className={inputClass}
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1">
                            <span className="text-sm text-text-secondary">
                                სახელი
                            </span>

                            <input
                                name="firstName"
                                autoComplete="given-name"
                                defaultValue={customer?.firstName ?? ""}
                                className={inputClass}
                            />
                        </label>

                        <label className="block space-y-1">
                            <span className="text-sm text-text-secondary">
                                გვარი
                            </span>

                            <input
                                name="lastName"
                                autoComplete="family-name"
                                defaultValue={customer?.lastName ?? ""}
                                className={inputClass}
                            />
                        </label>
                    </div>

                    <label className="block space-y-1">
                        <span className="text-sm text-text-secondary">
                            მისამართი *
                        </span>

                        <textarea
                            name="address"
                            autoComplete="street-address"
                            required
                            rows={3}
                            defaultValue={customer?.address ?? ""}
                            placeholder="ქალაქი, ქუჩა, ნომერი"
                            className={
                                "w-full resize-y rounded-xl border " +
                                "border-border bg-background p-3 " +
                                "text-[16px] text-text-primary " +
                                "outline-none focus:border-accent"
                            }
                        />
                    </label>
                </fieldset>

                {customer && (
                    <p className="text-xs text-text-secondary">
                        ცვლილებები უკვე შექმნილი შეკვეთების
                        მიმღების ინფორმაციას არ შეცვლის.
                    </p>
                )}

                {error && (
                    <p role="alert" className="text-sm text-warning">
                        {error}
                    </p>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={close}
                        className="rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50"
                    >
                        {uncertain ? "დახურვა" : "გაუქმება"}
                    </button>

                    <button
                        type="submit"
                        disabled={saving || uncertain}
                        className={
                            "inline-flex items-center gap-2 rounded-xl " +
                            "bg-success px-4 py-3 text-sm font-semibold " +
                            "text-white disabled:opacity-50"
                        }
                    >
                        <Icon
                            icon={
                                saving
                                    ? "solar:refresh-linear"
                                    : "solar:check-circle-linear"
                            }
                            className={`h-5 w-5 ${saving ? "animate-spin" : ""
                                }`}
                        />

                        {saving ? "ინახება…" : "შენახვა"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
