"use client";
import useTransientNotice from '@/components/shared/useTransientNotice';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { prepareAccountPhoto } from "@/lib/images/prepare-account-photo";
import EmailChangeDialog from "@/components/dashboard/profile/EmailChangeDialog";
import PhoneChangeDialog from "@/components/dashboard/profile/PhoneChangeDialog";

import {
    ProfileSettingsError,
    validateProfileSettings,
    type ProfileSettingsData,
    type ProfileSettingsField,
} from "@/lib/profile/profile-settings";

type ApiResponse = {
    success?: boolean;
    profile?: ProfileSettingsData;
    message?: string;
    field?: ProfileSettingsField;
};

export default function ProfileSettingsForm({
    initialProfile,
}: {
    initialProfile: ProfileSettingsData;
}) {
    const router = useRouter();

    const [saved, setSaved] = useState(initialProfile);
    const [firstName, setFirstName] = useState(
        initialProfile.firstName ?? "",
    );
    const [lastName, setLastName] = useState(
        initialProfile.lastName ?? "",
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [errorField, setErrorField] =
        useState<ProfileSettingsField>("form");
    const [notice, setNotice] = useState("");
    useTransientNotice(notice, setNotice);

    const running = useRef(false);
    const mounted = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const avatarInput = useRef<HTMLInputElement | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [emailChangeOpen, setEmailChangeOpen] = useState(false);
    const [phoneChangeOpen, setPhoneChangeOpen] = useState(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (
            busy ||
            initialProfile.id !== saved.id ||
            new Date(initialProfile.updatedAt).getTime() <=
            new Date(saved.updatedAt).getTime()
        ) {
            return;
        }

        // Refresh saved data while preserving unsaved name edits.
        setFirstName(value =>
            value === (saved.firstName ?? "")
                ? initialProfile.firstName ?? ""
                : value,
        );
        setLastName(value =>
            value === (saved.lastName ?? "")
                ? initialProfile.lastName ?? ""
                : value,
        );
        setSaved(initialProfile);
    }, [initialProfile, saved, busy]);

    const dirty =
        firstName !== (saved.firstName ?? "") ||
        lastName !== (saved.lastName ?? "");

    const fullName =
        [saved.firstName, saved.lastName]
            .filter(Boolean)
            .join(" ") || "ჩემი ანგარიში";

    const initials =
        [saved.firstName, saved.lastName]
            .map(value => Array.from(value?.trim() ?? "")[0] ?? "")
            .join("") || "მ";

    const registeredAt = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tbilisi",
    })
        .format(new Date(saved.createdAt))
        .replaceAll("/", ".");

    function fieldClass(field: ProfileSettingsField) {
        return [
            "block min-h-11 w-full min-w-0 rounded-xl border",
            "bg-background px-3 py-2 text-base text-text-primary",
            "outline-none transition-colors focus:border-accent",
            error && errorField === field
                ? "border-danger"
                : "border-border",
        ].join(" ");
    }

    function cancel() {
        setFirstName(saved.firstName ?? "");
        setLastName(saved.lastName ?? "");
        setError("");
        setErrorField("form");
        setNotice("");
    }

    async function changeAvatar(file: File) {
        if (running.current) return;

        running.current = true;
        setBusy(true);
        setUploadingAvatar(true);
        setError("");
        setErrorField("form");
        setNotice("ფოტო მუშავდება…");

        const current = new AbortController();
        controller.current = current;

        try {
            const preparedFile = await prepareAccountPhoto(
                file,
                current.signal,
            );

            if (!mounted.current || current.signal.aborted) return;

            setNotice("ფოტო იტვირთება…");

            const form = new FormData();
            form.set("file", preparedFile);
            form.set("expectedUpdatedAt", saved.updatedAt);

            const response = await fetch("/api/profile/avatar", {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                body: form,
                signal: current.signal,
            });

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.profile ||
                body.profile.id !== saved.id
            ) {
                throw new Error(
                    body.message ||
                    "ფოტოს შენახვის შედეგი ვერ დადასტურდა. განაახლე მონაცემები და გადაამოწმე ფოტო.",
                );
            }

            if (!mounted.current) return;

            const latest = body.profile;

            setFirstName(value =>
                value === (saved.firstName ?? "")
                    ? latest.firstName ?? ""
                    : value,
            );
            setLastName(value =>
                value === (saved.lastName ?? "")
                    ? latest.lastName ?? ""
                    : value,
            );
            setSaved(latest);

            setNotice("პროფილის ფოტო წარმატებით შეიცვალა.");
            router.refresh();
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;

            setNotice("");
            setError(
                cause instanceof Error
                    ? cause.message
                    : "ფოტოს შენახვის შედეგი ვერ დადასტურდა. განაახლე მონაცემები და გადაამოწმე ფოტო.",
            );
        } finally {
            running.current = false;

            if (mounted.current) {
                setBusy(false);
                setUploadingAvatar(false);
            }
        }
    }

    async function submit(refresh = false) {
        if (running.current) return;

        let input:
            | ReturnType<typeof validateProfileSettings>
            | undefined;

        if (!refresh) {
            try {
                input = validateProfileSettings({
                    firstName,
                    lastName,
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
                    cause instanceof ProfileSettingsError
                        ? cause.field
                        : "form",
                );
                return;
            }
        }

        running.current = true;
        setBusy(true);
        setError("");
        setErrorField("form");
        setNotice("");

        const current = new AbortController();
        controller.current = current;

        try {
            const response = await fetch("/api/profile/settings", {
                method: refresh ? "GET" : "PATCH",
                credentials: "same-origin",
                cache: "no-store",
                signal: current.signal,
                ...(!refresh && input
                    ? {
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            firstName: input.firstName,
                            lastName: input.lastName,
                            expectedUpdatedAt: saved.updatedAt,
                        }),
                    }
                    : {}),
            });

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.profile ||
                body.profile.id !== saved.id
            ) {
                if (mounted.current) {
                    setErrorField(body.field ?? "form");
                }

                throw new Error(
                    body.message ||
                    "მოთხოვნის შედეგი ვერ დადასტურდა. განაახლე მონაცემები და გადაამოწმე.",
                );
            }

            if (!mounted.current) return;

            const latest = body.profile;

            if (refresh) {
                setFirstName(value =>
                    value === (saved.firstName ?? "")
                        ? latest.firstName ?? ""
                        : value,
                );
                setLastName(value =>
                    value === (saved.lastName ?? "")
                        ? latest.lastName ?? ""
                        : value,
                );
            } else {
                setFirstName(latest.firstName ?? "");
                setLastName(latest.lastName ?? "");
            }

            setSaved(latest);
            setNotice(
                refresh
                    ? "მონაცემები განახლდა. შეუნახავი ცვლილებები შენარჩუნებულია."
                    : "ცვლილებები შენახულია.",
            );
            router.refresh();
        } catch (cause: unknown) {
            if (!mounted.current || current.signal.aborted) return;

            setError(
                cause instanceof Error
                    ? cause.message
                    : "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.",
            );
        } finally {
            running.current = false;

            if (mounted.current) {
                setBusy(false);
            }
        }
    }

    return (
        <>
            <form
                onSubmit={event => {
                    event.preventDefault();
                    void submit();
                }}
                aria-busy={busy}
                className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
                <div className="flex items-start gap-3 border-b border-border pb-4">
                    <Icon
                        icon="solar:user-id-linear"
                        className="mt-0.5 size-6 shrink-0 text-accent"
                        aria-hidden="true"
                    />
                    <div className="min-w-0">
                        <h2 className="font-semibold text-text-primary">
                            პირადი ინფორმაცია
                        </h2>
                        <p className="mt-1 text-xs text-text-secondary">
                            ეს ინფორმაცია შენს პირად ანგარიშს ეხება.
                        </p>
                    </div>
                </div>

                <div className="flex min-w-0 items-center gap-4 py-5">
                    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/15 text-2xl font-semibold text-accent">
                        {saved.avatarUrl ? (
                            <Image
                                src={saved.avatarUrl}
                                alt="პროფილის ფოტო"
                                width={80}
                                height={80}
                                unoptimized
                                className="size-full object-cover"
                            />
                        ) : (
                            initials
                        )}
                    </div>

                    <div className="min-w-0">
                        <p className="break-words font-semibold text-text-primary">
                            {fullName}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                            პირადი ანგარიში
                        </p>

                        <input
                            ref={avatarInput}
                            type="file"
                            accept="image/*,.heic,.heif,.dng"
                            disabled={busy}
                            aria-label="პროფილის ფოტოს არჩევა"
                            className="hidden"
                            onChange={event => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";

                                if (file) {
                                    void changeAvatar(file);
                                }
                            }}
                        />

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => avatarInput.current?.click()}
                            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-text-primary transition-colors hover:bg-background disabled:opacity-50"
                        >
                            <Icon
                                icon={
                                    uploadingAvatar
                                        ? "solar:refresh-linear"
                                        : "solar:camera-linear"
                                }
                                className={`size-4 shrink-0 ${uploadingAvatar ? "animate-spin" : ""
                                    }`}
                                aria-hidden="true"
                            />
                            {uploadingAvatar
                                ? "მუშავდება…"
                                : "ფოტოს შეცვლა"}
                        </button>

                        <p className="mt-2 text-xs text-text-secondary">
                            ფოტო ავტომატურად შეინახება
                        </p>
                    </div>
                </div>

                <fieldset
                    disabled={busy}
                    className="min-w-0 space-y-4 border-t border-border pt-5 disabled:opacity-70"
                >
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        {([
                            ["firstName", "სახელი", firstName, setFirstName],
                            ["lastName", "გვარი", lastName, setLastName],
                        ] as const).map(([field, label, value, setter]) => (
                            <label
                                key={field}
                                className="block min-w-0 space-y-2"
                            >
                                <span className="text-sm text-text-primary">
                                    {label}
                                </span>
                                <input
                                    required
                                    autoComplete={
                                        field === "firstName"
                                            ? "given-name"
                                            : "family-name"
                                    }
                                    value={value}
                                    onChange={event => {
                                        setter(event.target.value);
                                        setNotice("");
                                    }}
                                    aria-invalid={
                                        Boolean(error) && errorField === field
                                    }
                                    aria-describedby={
                                        error && errorField === field
                                            ? "profile-settings-error"
                                            : undefined
                                    }
                                    className={fieldClass(field)}
                                />
                            </label>
                        ))}
                    </div>

                    {([
                        ["ელფოსტა", saved.email, saved.emailVerifiedAt],
                        ["ტელეფონი", saved.phone, saved.phoneVerifiedAt],
                    ] as const).map(([label, value, verifiedAt]) => (
                        <div
                            key={label}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
                        >
                            <p className="col-start-1 row-start-1 text-sm text-text-primary">
                                {label}
                            </p>

                            <div className="col-span-2 col-start-1 row-start-2 flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-xl border border-border bg-background px-3 py-2.5 lg:col-span-1 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                                <p
                                    title={value}
                                    className="min-w-0 break-all text-base text-text-primary lg:truncate"
                                >
                                    {value}
                                </p>

                                <p
                                    className={[
                                        "flex shrink-0 items-center gap-1.5 text-xs",
                                        verifiedAt
                                            ? "text-success"
                                            : "text-warning",
                                    ].join(" ")}
                                >
                                    <Icon
                                        icon={
                                            verifiedAt
                                                ? "solar:check-circle-bold"
                                                : "solar:info-circle-linear"
                                        }
                                        className="size-5 shrink-0"
                                        aria-hidden="true"
                                    />
                                    {verifiedAt
                                        ? "დადასტურებულია"
                                        : "დაუდასტურებელია"}
                                </p>
                            </div>

                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    if (running.current) return;

                                    setError("");
                                    setNotice("");

                                    if (label === "ელფოსტა") {
                                        setEmailChangeOpen(true);
                                    } else {
                                        setPhoneChangeOpen(true);
                                    }
                                }}
                                className="col-start-2 row-start-1 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-2 text-sm text-accent hover:bg-accent/10 disabled:opacity-50 lg:row-start-2"
                            >
                                <Icon
                                    icon="solar:pen-linear"
                                    className="size-5 shrink-0"
                                    aria-hidden="true"
                                />
                                შეცვლა
                            </button>
                        </div>
                    ))}

                </fieldset>

                {error && (
                    <p
                        id="profile-settings-error"
                        role="alert"
                        className="mt-4 text-sm text-danger"
                    >
                        {error}
                    </p>
                )}

                {notice && (
                    <p
                        role="status"
                        className="mt-4 text-sm text-text-secondary"
                    >
                        {notice}
                    </p>
                )}

                <div className="mt-5 space-y-4 border-t border-border pt-4">
                    <p className="flex items-center gap-2 text-xs text-text-secondary">
                        <Icon
                            icon="solar:calendar-linear"
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        რეგისტრაცია: {registeredAt}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submit(true)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                        >
                            <Icon
                                icon="solar:refresh-linear"
                                className="size-4"
                                aria-hidden="true"
                            />
                            მონაცემების განახლება
                        </button>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={busy || !dirty}
                                onClick={cancel}
                                className="min-h-10 rounded-xl border border-border px-3 text-sm text-text-primary disabled:opacity-50"
                            >
                                გაუქმება
                            </button>

                            <button
                                type="submit"
                                disabled={busy || !dirty}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                <Icon
                                    icon={
                                        busy
                                            ? "solar:refresh-linear"
                                            : "solar:check-circle-linear"
                                    }
                                    className={`size-4 shrink-0 ${busy ? "animate-spin" : ""
                                        }`}
                                    aria-hidden="true"
                                />
                                {busy ? "მუშავდება…" : "ცვლილებების შენახვა"}
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            {emailChangeOpen && (
                <EmailChangeDialog
                    profileId={saved.id}
                    onClose={() => setEmailChangeOpen(false)}
                    onChanged={(latest, logoutOtherSessions) => {
                        setFirstName(value =>
                            value === (saved.firstName ?? "")
                                ? latest.firstName ?? ""
                                : value,
                        );
                        setLastName(value =>
                            value === (saved.lastName ?? "")
                                ? latest.lastName ?? ""
                                : value,
                        );
                        setSaved(latest);
                        setError("");
                        setErrorField("form");
                        setNotice(
                            logoutOtherSessions
                                ? "ელფოსტა შეიცვალა. სხვა მოწყობილობებიდან გამოსვლა შესრულებულია."
                                : "ელფოსტა წარმატებით შეიცვალა.",
                        );

                        router.refresh();
                    }}
                />
            )}
            {phoneChangeOpen && (
                <PhoneChangeDialog
                    profileId={saved.id}
                    onClose={() => setPhoneChangeOpen(false)}
                    onChanged={latest => {
                        setFirstName(value =>
                            value === (saved.firstName ?? "")
                                ? latest.firstName ?? ""
                                : value,
                        );
                        setLastName(value =>
                            value === (saved.lastName ?? "")
                                ? latest.lastName ?? ""
                                : value,
                        );
                        setSaved(latest);
                        setError("");
                        setErrorField("form");
                        setNotice(
                            "ტელეფონის ნომერი წარმატებით შეიცვალა.",
                        );

                        router.refresh();
                    }}
                />
            )}
        </>
    );
}