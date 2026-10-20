"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import OtpInput from "@/components/auth/OtpInput";
import type { ProfileSettingsData } from "@/lib/profile/profile-settings";

type Step = "password" | "phone" | "code";
type Action = "authorize" | "send-code" | "verify";

type ApiResponse = {
    success?: boolean;
    message?: string;
    authorization?: string;
    newPhone?: string;
    retryAfter?: number;
    codeRequested?: boolean;
    profile?: ProfileSettingsData;
};

type Props = {
    profileId: string;
    onClose: () => void;
    onChanged: (profile: ProfileSettingsData) => void;
};

const inputClass =
    "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-accent";

export default function PhoneChangeDialog({
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
    const [phone, setPhone] = useState("");
    const [sentPhone, setSentPhone] = useState("");
    const [code, setCode] = useState<string[]>(
        ["", "", "", "", "", ""],
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
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
                    : step === "phone"
                        ? 'input[name="newPhone"]'
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
        if (!running.current) onClose();
    }

    function restart() {
        setStep("password");
        setAuthorization("");
        setPassword("");
        setShowPassword(false);
        setCode(["", "", "", "", "", ""]);
        setSentPhone("");
        setNotice("");
    }

    async function perform(action: Action) {
        if (running.current) return;

        if (
            action === "verify" &&
            !/^\d{6}$/.test(code.join(""))
        ) {
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
                            newPhone:
                                step === "code" ? sentPhone : phone,
                        }
                        : {
                            authorization,
                            code: code.join(""),
                        };

            const response = await fetch(
                `/api/profile/phone/${action}`,
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

            if (
                action === "send-code" &&
                body.codeRequested === true &&
                body.newPhone
            ) {
                setSentPhone(body.newPhone);
                setPhone(body.newPhone);
                setCode(["", "", "", "", "", ""]);
                setStep("code");
                setError(
                    body.message ||
                    "გაგზავნა ვერ დადასტურდა. თუ SMS მიიღე, შეიყვანე მიღებული კოდი.",
                );
                return;
            }

            if (!response.ok || body.success !== true) {
                if (response.status === 409) restart();

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
                setStep("phone");
                setRetryUntil(0);
                return;
            }

            if (action === "send-code") {
                if (!body.newPhone) {
                    throw new Error(
                        "SMS-ის გაგზავნის შედეგი ვერ დადასტურდა.",
                    );
                }

                setSentPhone(body.newPhone);
                setPhone(body.newPhone);
                setCode(["", "", "", "", "", ""]);
                setStep("code");
                setNotice("SMS-კოდი გაგზავნილია.");
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

            onChanged(body.profile);
            onClose();
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                current.signal.aborted
                    ? "პასუხის ლოდინის დრო ამოიწურა. დადასტურებისას იგივე კოდით ხელახლა სცადე; SMS-ის გაგზავნისას შეამოწმე შეტყობინებები და საჭიროების შემთხვევაში ხელახლა გაგზავნე."
                    : cause instanceof Error
                        ? cause.message
                        : "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.",
            );
        } finally {
            window.clearTimeout(timeout);
            running.current = false;

            if (mounted.current) setBusy(false);
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
                            icon="solar:phone-linear"
                            className="size-5 shrink-0 text-accent"
                            aria-hidden="true"
                        />
                        ტელეფონის შეცვლა
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
                    ნაბიჯი {step === "password" ? 1 : step === "phone" ? 2 : 3} / 3
                </p>

                <form
                    className="mt-5"
                    onSubmit={event => {
                        event.preventDefault();

                        void perform(
                            step === "password"
                                ? "authorize"
                                : step === "phone"
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

                        {step === "phone" && (
                            <>
                                <label className="block text-sm">
                                    ახალი ტელეფონის ნომერი
                                    <input
                                        required
                                        name="newPhone"
                                        type="tel"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        placeholder="+995"
                                        value={phone}
                                        onChange={event =>
                                            setPhone(event.target.value)
                                        }
                                        className={inputClass}
                                    />
                                </label>

                                <p className="text-xs text-text-secondary">
                                    ნომერი SMS-კოდის დადასტურების
                                    შემდეგ შეიცვლება.
                                </p>
                            </>
                        )}

                        {step === "code" && (
                            <>
                                <p className="text-sm text-text-secondary">
                                    შეიყვანე ამ ნომერზე გაგზავნილი კოდი:
                                </p>

                                <p className="break-all text-sm font-medium">
                                    {sentPhone}
                                </p>

                                <OtpInput
                                    idPrefix="phone"
                                    value={code}
                                    onChange={setCode}
                                    disabled={busy}
                                />

                                <p className="text-center text-xs text-text-secondary">
                                    სრული კოდის პირველ უჯრაში
                                    ჩაკოპირებაც შეგიძლია.
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
                                            : "SMS-ის ხელახლა გაგზავნა"}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setStep("phone");
                                            setCode(["", "", "", "", "", ""]);
                                            setError("");
                                            setNotice("");
                                        }}
                                        className="min-h-10 text-xs text-text-secondary"
                                    >
                                        ნომრის შეცვლა
                                    </button>
                                </div>
                            </>
                        )}
                    </fieldset>

                    {error && (
                        <p
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
                                    : step === "phone"
                                        ? "SMS-ის გაგზავნა"
                                        : "ნომრის შეცვლა"}
                        </button>
                    </div>
                </form>
            </div>
        </dialog>
    );
}