"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";

type ApiResponse = {
    success?: boolean;
    message?: string;
    retryAfter?: number;
};

export default function ForgotPasswordForm() {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [retryUntil, setRetryUntil] = useState(0);
    const [now, setNow] = useState(0);

    const running = useRef(false);
    const mounted = useRef(false);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (!retryUntil) return;

        setNow(Date.now());

        const timer = window.setInterval(() => {
            const timestamp = Date.now();
            setNow(timestamp);

            if (timestamp >= retryUntil) {
                window.clearInterval(timer);
            }
        }, 1000);

        return () => window.clearInterval(timer);
    }, [retryUntil]);

    const waitSeconds = Math.max(
        0,
        Math.ceil((retryUntil - now) / 1000),
    );

    async function submit() {
        if (running.current || waitSeconds > 0) return;

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
                "/api/auth/password-reset/request",
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email }),
                    signal: current.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (!mounted.current) return;

            if (!response.ok || body.success !== true) {
                throw new Error(
                    body.message ||
                    "მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.",
                );
            }

            const timestamp = Date.now();
            const seconds =
                typeof body.retryAfter === "number"
                    ? Math.max(0, body.retryAfter)
                    : 60;

            setNow(timestamp);
            setRetryUntil(timestamp + seconds * 1000);
            setNotice(
                body.message ||
                "თუ ამ ელფოსტით აქტიური ანგარიში არსებობს, აღდგენის ბმულს მიიღებ.",
            );
        } catch (cause: unknown) {
            if (!mounted.current) return;

            setError(
                current.signal.aborted
                    ? "პასუხის ლოდინის დრო ამოიწურა. შეამოწმე ელფოსტა და საჭიროების შემთხვევაში ხელახლა სცადე."
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
        <section className="w-full min-w-0 max-w-md rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon
                    icon="solar:lock-password-linear"
                    className="size-6"
                    aria-hidden="true"
                />
            </div>

            <h1 className="text-2xl font-semibold text-text-primary">
                დაგავიწყდა პაროლი?
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                მიუთითე ანგარიშის ელფოსტა. პაროლის აღდგენის
                ბმულს ამ მისამართზე გამოგიგზავნით.
            </p>

            <form
                className="mt-5 min-w-0"
                aria-busy={busy}
                onSubmit={event => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <label
                    htmlFor="recovery-email"
                    className="block text-sm text-text-primary"
                >
                    ელფოსტა
                </label>

                <input
                    id="recovery-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={busy}
                    value={email}
                    onChange={event => {
                        setEmail(event.target.value);
                        setError("");
                        setNotice("");
                    }}
                    placeholder="name@example.com"
                    className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-accent disabled:opacity-50"
                />

                {error && (
                    <p role="alert" className="mt-4 text-sm text-danger">
                        {error}
                    </p>
                )}

                {notice && (
                    <div
                        role="status"
                        className="mt-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 p-3"
                    >
                        <Icon
                            icon="solar:letter-linear"
                            className="mt-0.5 size-5 shrink-0 text-success"
                            aria-hidden="true"
                        />
                        <p className="min-w-0 text-sm leading-relaxed text-text-primary">
                            {notice}
                        </p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={busy || waitSeconds > 0 || !email.trim()}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                    {busy && (
                        <Icon
                            icon="solar:refresh-linear"
                            className="size-4 animate-spin"
                            aria-hidden="true"
                        />
                    )}

                    {busy
                        ? "იგზავნება…"
                        : waitSeconds > 0
                            ? `ხელახლა გაგზავნა — ${waitSeconds} წმ`
                            : "აღდგენის ბმულის გაგზავნა"}
                </button>
            </form>

            <Link
                href="/login"
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm text-accent"
            >
                <Icon
                    icon="solar:arrow-left-linear"
                    className="size-4"
                    aria-hidden="true"
                />
                შესვლაზე დაბრუნება
            </Link>
        </section>
    );
}