"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import {
    PasswordSettingsError,
    validateNewPassword,
} from "@/lib/profile/password-settings";

import {
    authCardClass,
    authInputClass,
    authLabelClass,
    authPrimaryButtonClass,
} from "@/components/auth/AuthShell";

type Field = "newPassword" | "confirmPassword" | "form";

type ApiResponse = {
    success?: boolean;
    message?: string;
    field?: Field;
};

export default function ResetPasswordForm() {
    const [ready, setReady] = useState(false);
    const [token, setToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [visible, setVisible] = useState({
        newPassword: false,
        confirmPassword: false,
    });
    const [busy, setBusy] = useState(false);
    const [success, setSuccess] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const [error, setError] = useState("");
    const [errorField, setErrorField] = useState<Field>("form");

    const mounted = useRef(false);
    const running = useRef(false);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;

        const params = new URLSearchParams(
            window.location.hash.slice(1),
        );
        const value = params.get("token") ?? "";

        if (/^[a-f0-9]{64}$/.test(value)) {
            setToken(value);
        } else {
            setInvalid(true);
        }

        setReady(true);

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    async function submit() {
        if (running.current || !ready || invalid || !token) return;

        setError("");
        setErrorField("form");

        try {
            validateNewPassword(newPassword);

            if (newPassword !== confirmPassword) {
                throw new PasswordSettingsError(
                    "პაროლები არ ემთხვევა.",
                    422,
                    "confirmPassword",
                );
            }
        } catch (cause: unknown) {
            setErrorField(
                cause instanceof PasswordSettingsError &&
                cause.field !== "currentPassword"
                    ? cause.field
                    : "form",
            );
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე შევსებული ველები.",
            );
            return;
        }

        running.current = true;
        setBusy(true);

        const current = new AbortController();
        controller.current = current;

        const timeout = window.setTimeout(
            () => current.abort(),
            30_000,
        );

        try {
            const response = await fetch(
                "/api/auth/password-reset/confirm",
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        token,
                        newPassword,
                        confirmPassword,
                    }),
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (!mounted.current) return;

            if (!response.ok || body.success !== true) {
                if (response.status === 410) {
                    setInvalid(true);
                    setToken("");
                    setNewPassword("");
                    setConfirmPassword("");
                }

                setErrorField(body.field ?? "form");

                throw new Error(
                    body.message ||
                    "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე.",
                );
            }

            setNewPassword("");
            setConfirmPassword("");
            setToken("");
            setSuccess(true);

            window.history.replaceState(
                window.history.state,
                "",
                window.location.pathname + window.location.search,
            );
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                current.signal.aborted
                    ? "პასუხის ლოდინის დრო ამოიწურა. ხელახლა სცადე. თუ ბმული აღარ მოქმედებს, სცადე ახალი პაროლით შესვლა."
                    : cause instanceof Error
                        ? cause.message
                        : "შენახვის შედეგი ვერ დადასტურდა.",
            );
        } finally {
            window.clearTimeout(timeout);
            running.current = false;

            if (mounted.current) setBusy(false);
        }
    }

    return (
        <section className={authCardClass}>
            <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon
                    icon={
                        success
                            ? "solar:check-circle-linear"
                            : "solar:lock-password-linear"
                    }
                    className="size-6"
                    aria-hidden="true"
                />
            </div>

            <h1 className="text-2xl font-semibold text-text-primary">
                {success
                    ? "პაროლი შეიცვალა"
                    : invalid
                        ? "ბმული აღარ მოქმედებს"
                        : "ახალი პაროლი"}
            </h1>

            {!ready ? (
                <p role="status" className="mt-3 text-sm text-text-secondary">
                    იტვირთება…
                </p>
            ) : success ? (
                <div role="status" className="mt-3">
                    <p className="text-sm leading-relaxed text-text-secondary">
                        პაროლი წარმატებით შეიცვალა. ყველა მოწყობილობაზე
                        ძველი სესიები გაუქმებულია. შედი ახალი პაროლით.
                    </p>
                </div>
            ) : invalid ? (
                <div className="mt-3 space-y-3">
                    <p role="alert" className="text-sm text-text-secondary">
                        {error ||
                            "ბმული არასწორია, გამოყენებულია ან ვადა გაუვიდა. მოითხოვე ახალი ბმული."}
                    </p>

                    <Link
                        href="/forgot-password"
                        className={`${authPrimaryButtonClass} sm:w-auto`}
                    >
                        ახალი ბმულის მოთხოვნა
                    </Link>
                </div>
            ) : (
                <>
                    <p className="mt-2 text-sm text-text-secondary">
                        შექმენი ანგარიშის ახალი პაროლი.
                    </p>

                    <form
                        className="mt-5 min-w-0"
                        aria-busy={busy}
                        onSubmit={event => {
                            event.preventDefault();
                            void submit();
                        }}
                    >
                        <fieldset
                            disabled={busy}
                            className="min-w-0 space-y-4 disabled:opacity-70"
                        >
                            {([
                                ["newPassword", "ახალი პაროლი"],
                                ["confirmPassword", "გაიმეორე ახალი პაროლი"],
                            ] as const).map(([field, label]) => (
                                <div key={field} className="min-w-0">
                                    <label
                                        htmlFor={`reset-${field}`}
                                        className={authLabelClass}
                                    >
                                        {label}
                                    </label>

                                    <div className="relative">
                                        <input
                                            id={`reset-${field}`}
                                            name={field}
                                            required
                                            type={visible[field] ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={
                                                field === "newPassword"
                                                    ? newPassword
                                                    : confirmPassword
                                            }
                                            onChange={event => {
                                                if (field === "newPassword") {
                                                    setNewPassword(event.target.value);
                                                } else {
                                                    setConfirmPassword(event.target.value);
                                                }

                                                setError("");
                                                setErrorField("form");
                                            }}
                                            aria-invalid={
                                                Boolean(error) && errorField === field
                                            }
                                            aria-describedby={
                                                error && errorField === field
                                                    ? "reset-password-error"
                                                    : undefined
                                            }
                                            className={`${authInputClass(
                                                Boolean(error) && errorField === field,
                                            )} pr-12`}
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setVisible(previous => ({
                                                    ...previous,
                                                    [field]: !previous[field],
                                                }))
                                            }
                                            aria-label={
                                                visible[field]
                                                    ? `${label} - დამალვა`
                                                    : `${label} - გამოჩენა`
                                            }
                                            aria-pressed={visible[field]}
                                            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-text-secondary"
                                        >
                                            <Icon
                                                icon={
                                                    visible[field]
                                                        ? "solar:eye-closed-linear"
                                                        : "solar:eye-linear"
                                                }
                                                className="size-5"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <p className="text-xs leading-relaxed text-text-secondary">
                                მინიმუმ 8 სიმბოლო, დიდი და პატარა
                                ლათინური ასო და ციფრი.
                            </p>
                        </fieldset>

                        {error && (
                            <p
                                id="reset-password-error"
                                role="alert"
                                className="mt-4 text-sm text-danger"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className={`mt-5 ${authPrimaryButtonClass}`}
                        >
                            {busy && (
                                <Icon
                                    icon="solar:refresh-linear"
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                />
                            )}
                            {busy ? "ინახება…" : "ახალი პაროლის შენახვა"}
                        </button>
                    </form>
                </>
            )}

            <Link
                href="/login"
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm text-accent"
            >
                <Icon
                    icon="solar:arrow-left-linear"
                    className="size-4"
                    aria-hidden="true"
                />
                {success ? "ანგარიშში შესვლა" : "შესვლაზე დაბრუნება"}
            </Link>
        </section>
    );
}