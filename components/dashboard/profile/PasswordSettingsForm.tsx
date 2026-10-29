"use client";
import useTransientNotice from '@/components/shared/useTransientNotice';

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";

import {
    PasswordSettingsError,
    getNewPasswordRules,
    validatePasswordChange,
    type PasswordSettingsField,
} from "@/lib/profile/password-settings";

type PasswordDraft = {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
};

type ApiResponse = {
    success?: boolean;
    message?: string;
    field?: PasswordSettingsField;
    retryAfter?: number;
    updatedAt?: string;
    logoutOtherSessions?: boolean;
};

const emptyDraft: PasswordDraft = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
};

const fields = [
    ["currentPassword", "მიმდინარე პაროლი", "current-password"],
    ["newPassword", "ახალი პაროლი", "new-password"],
    ["confirmPassword", "გაიმეორე ახალი პაროლი", "new-password"],
] as const;

export default function PasswordSettingsForm() {
    const router = useRouter();
    const titleId = useId();
    const errorId = useId();
    const inputPrefix = useId();

    const dialog = useRef<HTMLDialogElement>(null);
    const form = useRef<HTMLFormElement>(null);
    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const running = useRef(false);

    const pending = useRef<{
        id: string;
        signature: string;
    } | null>(null);

    const [draft, setDraft] = useState<PasswordDraft>(emptyDraft);
    const [visible, setVisible] = useState({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
    });
    const [choiceOpen, setChoiceOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [errorField, setErrorField] =
        useState<PasswordSettingsField>("form");
    const [notice, setNotice] = useState("");
    useTransientNotice(notice, setNotice);
    const [retryUntil, setRetryUntil] = useState(0);
    const [now, setNow] = useState(0);

    useEffect(() => {
        mounted.current = true;
        setNow(Date.now());

        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => {
            mounted.current = false;
            controller.current?.abort();
            pending.current = null;
            window.clearInterval(timer);
            dialog.current?.close();
        };
    }, []);

    useEffect(() => {
        const element = dialog.current;

        if (!element) return;

        if (choiceOpen && !element.open) {
            element.showModal();
        } else if (!choiceOpen && element.open) {
            element.close();
        }
    }, [choiceOpen]);

    const waitSeconds = Math.max(
        0,
        Math.ceil((retryUntil - now) / 1000),
    );

    const rules = getNewPasswordRules(draft.newPassword);

    function focusField(field: PasswordSettingsField) {
        if (field === "form") return;

        window.setTimeout(() => {
            form.current
                ?.querySelector<HTMLInputElement>(
                    `input[name="${field}"]`,
                )
                ?.focus();
        }, 0);
    }

    function openChoice() {
        if (running.current || waitSeconds > 0) return;

        setError("");
        setErrorField("form");
        setNotice("");

        try {
            validatePasswordChange(draft);
            setChoiceOpen(true);
        } catch (cause: unknown) {
            const field = cause instanceof PasswordSettingsError
                ? cause.field
                : "form";

            setErrorField(field);
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე შევსებული ველები.",
            );
            focusField(field);
        }
    }

    async function save(logoutOtherSessions: boolean) {
        if (running.current || waitSeconds > 0) return;

        let input: ReturnType<typeof validatePasswordChange>;

        try {
            input = validatePasswordChange(draft);
        } catch (cause: unknown) {
            setChoiceOpen(false);
            setError(
                cause instanceof Error
                    ? cause.message
                    : "გადაამოწმე შევსებული ველები.",
            );
            return;
        }

        const signature = JSON.stringify({
            ...input,
            logoutOtherSessions,
        });

        if (pending.current?.signature !== signature) {
            pending.current = {
                id: crypto.randomUUID(),
                signature,
            };
        }

        const clientRequestId = pending.current.id;

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
            const response = await fetch(
                "/api/profile/password/change",
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ...input,
                        clientRequestId,
                        logoutOtherSessions,
                    }),
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

            if (!response.ok || body.success !== true) {
                if (response.status < 500) {
                    pending.current = null;
                }

                const field = body.field ?? "form";
                setErrorField(field);
                focusField(field);

                throw new Error(
                    body.message ||
                    "შენახვის შედეგი ვერ დადასტურდა. იგივე მონაცემებით ხელახლა სცადე.",
                );
            }

            pending.current = null;
            setDraft(emptyDraft);
            setVisible({
                currentPassword: false,
                newPassword: false,
                confirmPassword: false,
            });
            setRetryUntil(0);
            setNotice(
                body.logoutOtherSessions
                    ? "პაროლი შეიცვალა. სხვა მოწყობილობებიდან გამოსვლა შესრულებულია."
                    : "პაროლი წარმატებით შეიცვალა.",
            );

            router.refresh();
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                current.signal.aborted
                    ? "პასუხის ლოდინის დრო ამოიწურა. იგივე მონაცემებითა და გამოსვლის არჩევანით ხელახლა სცადე."
                    : cause instanceof Error
                        ? cause.message
                        : "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე.",
            );
        } finally {
            window.clearTimeout(timeout);
            running.current = false;

            if (mounted.current) {
                setBusy(false);
                setChoiceOpen(false);
            }
        }
    }

    return (
        <>
            <form
                ref={form}
                onSubmit={event => {
                    event.preventDefault();
                    openChoice();
                }}
                aria-busy={busy}
                className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
                <div className="flex items-start gap-3 border-b border-border pb-4">
                    <Icon
                        icon="solar:lock-keyhole-linear"
                        className="mt-0.5 size-6 shrink-0 text-accent"
                        aria-hidden="true"
                    />

                    <div className="min-w-0">
                        <h2 className="font-semibold text-text-primary">
                            პაროლის შეცვლა
                        </h2>
                        <p className="mt-1 text-xs text-text-secondary">
                            გამოიყენე ახალი პაროლი ანგარიშის დასაცავად.
                        </p>
                    </div>
                </div>

                <fieldset
                    disabled={busy}
                    className="mt-5 min-w-0 space-y-4 disabled:opacity-70"
                >
                    {fields.map(([field, label, autoComplete]) => (
                        <div key={field} className="min-w-0">
                            <label
                                htmlFor={`${inputPrefix}-${field}`}
                                className="text-sm text-text-primary"
                            >
                                {label}
                            </label>

                            <div className="relative mt-2">
                                <input
                                    id={`${inputPrefix}-${field}`}
                                    name={field}
                                    required
                                    type={visible[field] ? "text" : "password"}
                                    autoComplete={autoComplete}
                                    value={draft[field]}
                                    onChange={event => {
                                        const value = event.target.value;

                                        setDraft(previous => ({
                                            ...previous,
                                            [field]: value,
                                        }));
                                        pending.current = null;
                                        setNotice("");
                                        setError("");
                                        setErrorField("form");
                                    }}
                                    aria-invalid={
                                        Boolean(error) && errorField === field
                                    }
                                    aria-describedby={
                                        error && errorField === field
                                            ? errorId
                                            : undefined
                                    }
                                    className={[
                                        "block min-h-11 w-full min-w-0 rounded-xl border",
                                        "bg-background py-2 pl-3 pr-12 text-base text-text-primary",
                                        "outline-none focus:border-accent",
                                        error && errorField === field
                                            ? "border-danger"
                                            : "border-border",
                                    ].join(" ")}
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

                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {([
                            ["length", "მინიმუმ 8 სიმბოლო"],
                            ["uppercase", "დიდი ლათინური ასო"],
                            ["lowercase", "პატარა ლათინური ასო"],
                            ["number", "ციფრი"],
                        ] as const).map(([key, label]) => (
                            <p
                                key={key}
                                className={[
                                    "flex items-start gap-1.5",
                                    rules[key]
                                        ? "text-success"
                                        : "text-text-secondary",
                                ].join(" ")}
                            >
                                <Icon
                                    icon={
                                        rules[key]
                                            ? "solar:check-circle-linear"
                                            : "solar:record-circle-linear"
                                    }
                                    className="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                {label}
                            </p>
                        ))}
                    </div>
                </fieldset>

                <Link
                    href="/forgot-password"
                    className="mt-2 inline-flex min-h-10 items-center text-sm text-accent hover:text-accent-hover"
                >
                    დაგავიწყდა პაროლი?
                </Link>

                {error && (
                    <p
                        id={errorId}
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

                <button
                    type="submit"
                    disabled={busy || waitSeconds > 0}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                    <Icon
                        icon={
                            busy
                                ? "solar:refresh-linear"
                                : "solar:lock-keyhole-linear"
                        }
                        className={`size-5 shrink-0 ${busy ? "animate-spin" : ""
                            }`}
                        aria-hidden="true"
                    />
                    {busy
                        ? "მუშავდება…"
                        : waitSeconds > 0
                            ? `სცადე ${waitSeconds} წამში`
                            : "პაროლის განახლება"}
                </button>
            </form>

            <dialog
                ref={dialog}
                aria-labelledby={titleId}
                aria-busy={busy}
                onCancel={event => {
                    event.preventDefault();

                    if (!running.current) setChoiceOpen(false);
                }}
                onClose={event => {
                    if (
                        mounted.current &&
                        !running.current &&
                        !event.currentTarget.open
                    ) {
                        setChoiceOpen(false);
                    }
                }}
                className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:p-5"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id={titleId} className="font-semibold">
                        გსურს სხვა მოწყობილობებიდან გამოსვლა?
                    </h2>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChoiceOpen(false)}
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

                <p className="mt-3 text-sm text-text-secondary">
                    არჩევის შემდეგ პაროლი შეიცვლება.
                    მიმდინარე მოწყობილობაზე შესული დარჩები.
                </p>

                <div className="mt-5 grid gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save(true)}
                        className="min-h-11 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {busy ? "მუშავდება…" : "დიახ, გამოვიდე"}
                    </button>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save(false)}
                        className="min-h-11 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
                    >
                        არა, დარჩეს შესული
                    </button>
                </div>
            </dialog>
        </>
    );
}