"use client";
import useTransientNotice from '@/components/shared/useTransientNotice';

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import OtpInput from "@/components/auth/OtpInput";
import type { ProfileSettingsData } from "@/lib/profile/profile-settings";

type Step = "password" | "email" | "code";

type ApiResponse = {
    success?: boolean;
    message?: string;
    authorization?: string;
    expiresAt?: string;
    newEmail?: string;
    retryAfter?: number;
    codeRequested?: boolean;
    logoutOtherSessions?: boolean;
    profile?: ProfileSettingsData;
};

type Props = {
    profileId: string;
    onClose: () => void;
    onChanged: (
        profile: ProfileSettingsData,
        logoutOtherSessions: boolean,
    ) => void;
};

const inputClass =
    "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-accent";

export default function EmailChangeDialog({
    profileId,
    onClose,
    onChanged,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const running = useRef(false);
    const titleId = useId();

    const [step, setStep] = useState<Step>("password");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [authorization, setAuthorization] = useState("");
    const [email, setEmail] = useState("");
    const [sentEmail, setSentEmail] = useState("");
    const [logoutOthers, setLogoutOthers] =
        useState<boolean | null>(null);
    const [code, setCode] = useState<string[]>(
        ["", "", "", "", "", ""],
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    useTransientNotice(notice, setNotice);
    const [retryUntil, setRetryUntil] = useState(0);
    const [now, setNow] = useState(0);

    useEffect(() => {
        mounted.current = true;

        const element = dialog.current;
        if (element && !element.open) element.showModal();

        setNow(Date.now());

        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => {
            mounted.current = false;
            controller.current?.abort();
            window.clearInterval(timer);
            element?.close();
        };
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const selector =
                step === "password"
                    ? 'input[name="currentPassword"]'
                    : step === "email"
                        ? 'input[name="newEmail"]'
                        : 'input[autocomplete="one-time-code"]';

            dialog.current
                ?.querySelector<HTMLInputElement>(selector)
                ?.focus();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [step]);

    const waitSeconds = Math.max(
        0,
        Math.ceil((retryUntil - now) / 1000),
    );

    function close() {
        if (running.current) return;
        onClose();
    }

    function restart() {
        setStep("password");
        setAuthorization("");
        setPassword("");
        setShowPassword(false);
        setCode(["", "", "", "", "", ""]);
        setSentEmail("");
        setNotice("");
    }

    async function perform(
        action: "authorize" | "send-code" | "verify",
    ) {
        if (running.current) return;

        if (action === "send-code" && logoutOthers === null) {
            setError(
                "აირჩიე, გსურს თუ არა სხვა მოწყობილობებიდან გამოსვლა.",
            );
            return;
        }

        if (action === "verify" && !/^\d{6}$/.test(code.join(""))) {
            setError("შეიყვანე ექვსნიშნა კოდი.");
            return;
        }

        running.current = true;
        setBusy(true);
        setError("");
        setNotice("");

        const current = new AbortController();
        controller.current = current;

        const timeout = window.setTimeout(
            () => current.abort(),
            30_000,
        );

        try {
            const payload =
                action === "authorize"
                    ? { password }
                    : action === "send-code"
                        ? {
                            authorization,
                            newEmail:
                                step === "code" ? sentEmail : email,
                            logoutOtherSessions: logoutOthers,
                        }
                        : {
                            authorization,
                            code: code.join(""),
                        };

            const response = await fetch(
                `/api/profile/email/${action}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (!mounted.current) return;

            if (
                typeof body.retryAfter === "number" &&
                body.retryAfter > 0
            ) {
                const timestamp = Date.now();

                setNow(timestamp);
                setRetryUntil(
                    timestamp + body.retryAfter * 1000,
                );
            }

            // Delivery can succeed even when its response is uncertain.
            // Allow entering a received code in that case.
            if (
                action === "send-code" &&
                body.codeRequested === true &&
                body.newEmail
            ) {
                setSentEmail(body.newEmail);
                setEmail(body.newEmail);
                setCode(["", "", "", "", "", ""]);
                setStep("code");
                setError(
                    body.message ||
                    "გაგზავნა ვერ დადასტურდა. თუ კოდი მიიღე, შეიყვანე აქ.",
                );
                return;
            }

            if (!response.ok || body.success !== true) {
                if (response.status === 409) {
                    restart();
                }

                throw new Error(
                    body.message ||
                    "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.",
                );
            }

            if (action === "authorize") {
                if (
                    !body.authorization ||
                    !/^[a-f0-9]{64}$/.test(body.authorization)
                ) {
                    throw new Error(
                        "პაროლის დადასტურების შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
                    );
                }

                setAuthorization(body.authorization);
                setPassword("");
                setShowPassword(false);
                setStep("email");
                setRetryUntil(0);
                return;
            }

            if (action === "send-code") {
                if (!body.newEmail) {
                    throw new Error(
                        "გაგზავნის შედეგი ვერ დადასტურდა.",
                    );
                }

                setSentEmail(body.newEmail);
                setEmail(body.newEmail);
                setCode(["", "", "", "", "", ""]);
                setStep("code");
                setNotice("კოდი გაგზავნილია. შეამოწმე ელფოსტა.");
                return;
            }

            if (
                !body.profile ||
                body.profile.id !== profileId
            ) {
                throw new Error(
                    "შენახვის შედეგი ვერ დადასტურდა. დახურე ფანჯარა და განაახლე პროფილის მონაცემები.",
                );
            }

            onChanged(
                body.profile,
                body.logoutOtherSessions === true,
            );
            onClose();
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                current.signal.aborted
                    ? "პასუხის ლოდინის დრო ამოიწურა. თუ კოდი მიიღე, შეგიძლია ხელახლა გაგზავნის შემდეგ შეიყვანო. დადასტურებისას შეფერხების შემთხვევაში იგივე კოდით ხელახლა სცადე."
                    : cause instanceof Error
                        ? cause.message
                        : "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.",
            );
        } finally {
            window.clearTimeout(timeout);
            running.current = false;

            if (mounted.current) {
                setBusy(false);
            }
        }
    }

    return (
        <dialog
            ref={dialog}
            aria-labelledby={titleId}
            aria-busy={busy}
            onCancel={event => {
                event.preventDefault();
                close();
            }}
            onClose={event => {
                if (
                    mounted.current &&
                    !running.current &&
                    !event.currentTarget.open
                ) {
                    onClose();
                }
            }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <h2
                        id={titleId}
                        className="flex min-w-0 items-center gap-2 font-semibold"
                    >
                        <Icon
                            icon="solar:letter-linear"
                            className="size-5 shrink-0 text-accent"
                            aria-hidden="true"
                        />
                        ელფოსტის შეცვლა
                    </h2>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        aria-label="ფანჯრის დახურვა"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border disabled:opacity-50"
                    >
                        <Icon
                            icon="solar:close-circle-linear"
                            className="size-5"
                            aria-hidden="true"
                        />
                    </button>
                </div>

                <p className="mt-2 text-xs text-text-secondary">
                    ნაბიჯი {step === "password" ? 1 : step === "email" ? 2 : 3} / 3
                </p>

                <form
                    className="mt-5"
                    onSubmit={event => {
                        event.preventDefault();

                        void perform(
                            step === "password"
                                ? "authorize"
                                : step === "email"
                                    ? "send-code"
                                    : "verify",
                        );
                    }}
                >
                    <fieldset
                        disabled={busy}
                        className="min-w-0 space-y-4 disabled:opacity-70"
                    >
                        {step === "password" && (
                            <>
                                <p className="text-sm text-text-secondary">
                                    უსაფრთხოებისთვის ჯერ შეიყვანე
                                    მიმდინარე პაროლი.
                                </p>

                                <label className="block text-sm">
                                    მიმდინარე პაროლი
                                    <span className="relative block">
                                        <input
                                            required
                                            name="currentPassword"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={event =>
                                                setPassword(event.target.value)
                                            }
                                            className={`${inputClass} pr-12`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPassword(value => !value)
                                            }
                                            aria-label={
                                                showPassword
                                                    ? "პაროლის დამალვა"
                                                    : "პაროლის გამოჩენა"
                                            }
                                            aria-pressed={showPassword}
                                            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-text-secondary"
                                        >
                                            <Icon
                                                icon={
                                                    showPassword
                                                        ? "solar:eye-closed-linear"
                                                        : "solar:eye-linear"
                                                }
                                                className="size-5"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </span>
                                </label>
                            </>
                        )}

                        {step === "email" && (
                            <>
                                <label className="block text-sm">
                                    ახალი ელფოსტა
                                    <input
                                        required
                                        name="newEmail"
                                        type="email"
                                        autoComplete="email"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        value={email}
                                        onChange={event =>
                                            setEmail(event.target.value)
                                        }
                                        className={inputClass}
                                    />
                                </label>

                                <fieldset className="space-y-2">
                                    <legend className="mb-2 text-sm">
                                        გსურს სხვა მოწყობილობებიდან გამოსვლა?
                                    </legend>

                                    {([
                                        [true, "დიახ, გამოვიდე"],
                                        [false, "არა, დარჩეს შესული"],
                                    ] as const).map(([value, label]) => (
                                        <label
                                            key={String(value)}
                                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm"
                                        >
                                            <input
                                                required
                                                type="radio"
                                                name="logoutOtherSessions"
                                                checked={logoutOthers === value}
                                                onChange={() =>
                                                    setLogoutOthers(value)
                                                }
                                                className="size-4 shrink-0 accent-accent"
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </fieldset>

                                <p className="text-xs text-text-secondary">
                                    მიმდინარე მოწყობილობაზე შესული დარჩები.
                                    ელფოსტა კოდის დადასტურების შემდეგ შეიცვლება.
                                </p>
                            </>
                        )}

                        {step === "code" && (
                            <>
                                <p className="text-sm text-text-secondary">
                                    შეიყვანე ამ მისამართზე გაგზავნილი კოდი:
                                </p>
                                <p className="break-all text-sm font-medium">
                                    {sentEmail}
                                </p>

                                <OtpInput
                                    idPrefix="email"
                                    value={code}
                                    onChange={setCode}
                                    disabled={busy}
                                />

                                <p className="text-center text-xs text-text-secondary">
                                    სრული კოდის პირველ უჯრაში ჩაკოპირებაც შეგიძლია.
                                </p>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        disabled={busy || waitSeconds > 0}
                                        onClick={() => void perform("send-code")}
                                        className="min-h-10 text-xs text-accent disabled:text-text-secondary"
                                    >
                                        {waitSeconds > 0
                                            ? `ხელახლა გაგზავნა — ${waitSeconds} წმ`
                                            : "კოდის ხელახლა გაგზავნა"}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setStep("email");
                                            setCode(["", "", "", "", "", ""]);
                                            setError("");
                                            setNotice("");
                                        }}
                                        className="min-h-10 text-xs text-text-secondary"
                                    >
                                        მისამართის შეცვლა
                                    </button>
                                </div>
                            </>
                        )}
                    </fieldset>

                    {error && (
                        <p role="alert" className="mt-4 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    {notice && (
                        <p role="status" className="mt-4 text-sm text-text-secondary">
                            {notice}
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={close}
                            className="min-h-10 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                        >
                            დახურვა
                        </button>

                        <button
                            type="submit"
                            disabled={
                                busy ||
                                (step !== "code" && waitSeconds > 0) ||
                                (step === "code" && !/^\d{6}$/.test(code.join("")))
                            }
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {busy && (
                                <Icon
                                    icon="solar:refresh-linear"
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                />
                            )}
                            {busy
                                ? "მუშავდება…"
                                : step === "password"
                                    ? "პაროლის დადასტურება"
                                    : step === "email"
                                        ? "კოდის გაგზავნა"
                                        : "ელფოსტის შეცვლა"}
                        </button>
                    </div>
                </form>
            </div>
        </dialog>
    );
}