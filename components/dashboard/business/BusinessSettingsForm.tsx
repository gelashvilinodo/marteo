"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

import {
    BusinessSettingsError,
    validateBusinessSettings,
    type BusinessSettingsData,
} from "@/lib/business/business-settings";

import { prepareAccountPhoto } from "@/lib/images/prepare-account-photo";

type ApiResponse = {
    success?: boolean;
    business?: BusinessSettingsData;
    message?: string;
    field?: "name" | "phone" | "form";
};

export default function BusinessSettingsForm({
    initialBusiness,
}: {
    initialBusiness: BusinessSettingsData;
}) {
    const router = useRouter();

    const [saved, setSaved] = useState(initialBusiness);
    const [name, setName] = useState(initialBusiness.name);
    const [phone, setPhone] = useState(
        initialBusiness.phone ?? "",
    );

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [errorField, setErrorField] = useState<
        "name" | "phone" | "form"
    >("form");
    const [notice, setNotice] = useState("");

    const running = useRef(false);
    const mounted = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const logoInput = useRef<HTMLInputElement | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    const dirty =
        name !== saved.name ||
        phone !== (saved.phone ?? "");

    function fieldClass(field: "name" | "phone") {
        return [
            "block min-h-11 w-full min-w-0 rounded-xl border",
            "bg-background px-3 py-2 text-base text-text-primary",
            "outline-none transition-colors focus:border-accent",
            error && errorField === field
                ? "border-danger"
                : "border-border",
        ].join(" ");
    }

    async function save() {
        if (running.current) return;

        let input: ReturnType<typeof validateBusinessSettings>;

        try {
            input = validateBusinessSettings({
                name,
                phone,
                expectedUpdatedAt: saved.updatedAt,
            });
        } catch (cause: unknown) {
            setNotice("");
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე შევსებული ველები.",
            );
            setErrorField(
                cause instanceof BusinessSettingsError
                    ? cause.field
                    : "form",
            );
            return;
        }

        running.current = true;
        setBusy(true);
        setError("");
        setNotice("");

        const current = new AbortController();
        controller.current = current;

        try {
            const response = await fetch(
                "/api/business/settings",
                {
                    method: "PATCH",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: input.name,
                        phone: input.phone ?? "",
                        expectedUpdatedAt: saved.updatedAt,
                    }),
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.business ||
                body.business.id !== saved.id
            ) {
                if (mounted.current) {
                    setErrorField(body.field ?? "form");
                }

                throw new Error(
                    body.message ||
                    "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე.",
                );
            }

            if (!mounted.current) return;

            setSaved(body.business);
            setName(body.business.name);
            setPhone(body.business.phone ?? "");
            setNotice("ცვლილებები შენახულია.");

            router.refresh();
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;

            setError(
                cause instanceof Error
                    ? cause.message
                    : "შენახვა ვერ დადასტურდა. ხელახლა სცადე.",
            );
        } finally {
            running.current = false;

            if (mounted.current) {
                setBusy(false);
            }
        }
    }

    async function changeLogo(file: File) {
        if (running.current) return;

        setError("");
        setErrorField("form");
        setNotice("");

        if (file.size === 0) {
            setError("არჩეული ფაილი ცარიელია.");
            return;
        }

        running.current = true;
        setBusy(true);
        setUploadingLogo(true);

        const current = new AbortController();
        controller.current = current;

        try {
            setNotice("ფოტო მუშავდება…");

            const preparedFile = await prepareAccountPhoto(
                file,
                current.signal,
            );

            if (!mounted.current || current.signal.aborted) return;

            setNotice("ლოგო იტვირთება…");

            const form = new FormData();
            form.set("file", preparedFile);
            form.set("expectedUpdatedAt", saved.updatedAt);

            const response = await fetch(
                "/api/business/settings/logo",
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    body: form,
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.business ||
                body.business.id !== saved.id
            ) {
                throw new Error(
                    body.message ||
                    "ლოგოს შენახვის შედეგი ვერ დადასტურდა. განაახლე მონაცემები და გადაამოწმე ლოგო.",
                );
            }

            if (!mounted.current) return;

            const latest = body.business;

            // Preserve any unsaved name or phone edits.
            setName(value =>
                value === saved.name ? latest.name : value,
            );
            setPhone(value =>
                value === (saved.phone ?? "")
                    ? latest.phone ?? ""
                    : value,
            );
            setSaved(latest);

            setNotice("ლოგო წარმატებით შეიცვალა.");
            router.refresh();
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;
            setNotice("");

            setError(
                cause instanceof Error
                    ? cause.message
                    : "ლოგოს შენახვის შედეგი ვერ დადასტურდა. განაახლე მონაცემები და გადაამოწმე ლოგო.",
            );
        } finally {
            running.current = false;

            if (mounted.current) {
                setBusy(false);
                setUploadingLogo(false);
            }
        }
    }

    async function reload() {
        if (running.current) return;

        running.current = true;
        setBusy(true);
        setError("");
        setNotice("");

        const current = new AbortController();
        controller.current = current;

        try {
            const response = await fetch(
                "/api/business/settings",
                {
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.business ||
                body.business.id !== saved.id
            ) {
                throw new Error(
                    body.message ||
                    "მონაცემები ვერ განახლდა.",
                );
            }

            if (!mounted.current) return;

            const latest = body.business;

            // მომხმარებლის შეცვლილი ველები რჩება.
            // შეუცვლელი ველები ბაზის ახალ მნიშვნელობებს იღებს.
            setName(value =>
                value === saved.name ? latest.name : value,
            );
            setPhone(value =>
                value === (saved.phone ?? "")
                    ? latest.phone ?? ""
                    : value,
            );
            setSaved(latest);
            setNotice(
                "მონაცემები განახლდა. შენი ცვლილებები შენარჩუნებულია — შენახვამდე გადაამოწმე.",
            );
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;

            setErrorField("form");
            setError(
                cause instanceof Error
                    ? cause.message
                    : "მონაცემები ვერ განახლდა.",
            );
        } finally {
            running.current = false;

            if (mounted.current) {
                setBusy(false);
            }
        }
    }

    return (
        <form
            onSubmit={event => {
                event.preventDefault();
                void save();
            }}
            aria-busy={busy}
            className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
            <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                <Icon
                    icon="solar:buildings-2-linear"
                    className="size-5 text-accent"
                    aria-hidden="true"
                />
                ბიზნესის ინფორმაცია
            </h2>

            <fieldset
                disabled={busy}
                className="mt-5 min-w-0 space-y-5 disabled:opacity-70"
            >
                <div className="flex items-center gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                        {saved.logoUrl ? (
                            <Image
                                src={saved.logoUrl}
                                alt="ბიზნესის ლოგო"
                                width={64}
                                height={64}
                                unoptimized
                                className="size-full object-contain"
                            />
                        ) : (
                            <Icon
                                icon="solar:buildings-2-linear"
                                className="size-7 text-accent"
                                aria-hidden="true"
                            />
                        )}
                    </div>

                    <div className="min-w-0 space-y-1.5">
                        <input
                            ref={logoInput}
                            type="file"
                            accept="image/*,.heic,.heif,.dng"
                            aria-label="ბიზნესის ლოგოს არჩევა"
                            className="hidden"
                            onChange={event => {
                                const file = event.currentTarget.files?.[0];

                                // Allow choosing the same file again after a failed upload.
                                event.currentTarget.value = "";

                                if (file) {
                                    void changeLogo(file);
                                }
                            }}
                        />

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => logoInput.current?.click()}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm text-text-primary transition-colors hover:bg-background disabled:opacity-50"
                        >
                            <Icon
                                icon={
                                    uploadingLogo
                                        ? "solar:refresh-linear"
                                        : "solar:camera-linear"
                                }
                                className={`size-4 shrink-0 ${uploadingLogo ? "animate-spin" : ""
                                    }`}
                                aria-hidden="true"
                            />
                            {uploadingLogo ? "იტვირთება…" : "ლოგოს შეცვლა"}
                        </button>

                        <p className="text-xs text-text-secondary">
                            ფოტოს ზომა ავტომატურად შემცირდება.
                        </p>

                        <p className="text-xs text-text-secondary">
                            არჩევის შემდეგ ლოგო ავტომატურად შეინახება.
                        </p>
                    </div>
                </div>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <label className="block min-w-0 space-y-2">
                        <span className="text-sm text-text-primary">
                            ბიზნესის სახელი
                        </span>
                        <input
                            required
                            autoComplete="organization"
                            value={name}
                            onChange={event => {
                                setName(event.target.value);
                                setNotice("");
                            }}
                            aria-invalid={
                                Boolean(error) && errorField === "name"
                            }
                            aria-describedby={
                                error && errorField === "name"
                                    ? "business-settings-error"
                                    : undefined
                            }
                            className={fieldClass("name")}
                        />
                    </label>

                    <label className="block min-w-0 space-y-2">
                        <span className="text-sm text-text-primary">
                            ბიზნესის ტელეფონი
                        </span>
                        <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            placeholder="+995"
                            value={phone}
                            onChange={event => {
                                setPhone(event.target.value);
                                setNotice("");
                            }}
                            aria-invalid={
                                Boolean(error) && errorField === "phone"
                            }
                            aria-describedby="business-phone-help business-settings-error"
                            className={fieldClass("phone")}
                        />
                        <span
                            id="business-phone-help"
                            className="block text-xs leading-relaxed text-text-secondary"
                        >
                            არასავალდებულო — მიუთითე ბიზნესის
                            საკონტაქტო ნომერი.
                        </span>
                    </label>
                </div>
            </fieldset>

            <div
                id="business-settings-error"
                role={error ? "alert" : undefined}
                className={error ? "mt-4 text-sm text-danger" : ""}
            >
                {error}
            </div>

            {notice && (
                <p role="status" className="mt-4 text-sm text-text-secondary">
                    {notice}
                </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <button
                    type="button"
                    onClick={() => void reload()}
                    disabled={busy}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                    <Icon
                        icon="solar:refresh-linear"
                        className="size-4"
                        aria-hidden="true"
                    />
                    მონაცემების განახლება
                </button>

                <button
                    type="submit"
                    disabled={busy || !dirty}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                    <Icon
                        icon={
                            busy
                                ? "solar:refresh-linear"
                                : "solar:check-circle-linear"
                        }
                        className={`size-4 ${busy ? "animate-spin" : ""}`}
                        aria-hidden="true"
                    />
                    {busy ? "მუშავდება…" : "ცვლილებების შენახვა"}
                </button>
            </div>
        </form>
    );
}