"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export default function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const requestLocked = useRef(false);

    const handleLogin = async () => {
        if (requestLocked.current) return;

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail || !password) {
            setError("შეიყვანეთ ელფოსტა და პაროლი.");
            return;
        }

        requestLocked.current = true;
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: normalizedEmail,
                    password,
                }),
            });

            const raw: unknown = await response.json().catch(() => null);

            const data =
                raw !== null &&
                typeof raw === "object" &&
                !Array.isArray(raw)
                    ? (raw as Record<string, unknown>)
                    : null;

            if (!response.ok) {
                throw new Error(
                    typeof data?.error === "string"
                        ? data.error
                        : "ანგარიშში შესვლა ვერ მოხერხდა."
                );
            }

            if (typeof data?.userId !== "string" || !data.userId) {
                throw new Error("სერვერის პასუხი ვერ დამუშავდა.");
            }

            setPassword("");

            // A fresh request lets the server read the new session cookie.
            window.location.replace("/dashboard");
            return;
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "დაფიქსირდა ტექნიკური შეცდომა."
            );
        }

        requestLocked.current = false;
        setLoading(false);
    };

    const inputClass =
        "w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent/10";

    return (
        <main className="min-h-screen bg-background">
            <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
                <section className="hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
                    <Link href="/" aria-label="MARTEO.GE">
                        <img
                            src="/images/logo.svg"
                            alt="MARTEO.GE"
                            className="h-20 w-auto"
                        />
                    </Link>

                    <div className="max-w-md">
                        <p className="mb-4 text-sm font-medium text-accent">
                            MARTEO.GE
                        </p>

                        <h1 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
                            თქვენი ბიზნესი.
                            <br />
                            ყველაფერი ერთ სივრცეში.
                        </h1>

                        <p className="mt-6 max-w-sm text-base leading-7 text-white/65">
                            შედით თქვენს ანგარიშში და გააგრძელეთ
                            ბიზნესის მართვა.
                        </p>
                    </div>

                    <p className="text-sm text-white/40">
                        © {new Date().getFullYear()} MARTEO.GE
                    </p>
                </section>

                <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
                    <div className="w-full max-w-md">
                        <div className="mb-8 flex justify-center lg:hidden">
                            <Link href="/" aria-label="MARTEO.GE">
                                <img
                                    src="/images/marteo-08.svg"
                                    alt="MARTEO.GE"
                                    className="h-12 w-auto dark:hidden"
                                />
                                <img
                                    src="/images/logo.svg"
                                    alt="MARTEO.GE"
                                    className="hidden h-12 w-auto dark:block"
                                />
                            </Link>
                        </div>

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleLogin();
                            }}
                            aria-busy={loading}
                            className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
                        >
                            <div className="mb-7">
                                <h2 className="text-2xl font-semibold text-text-primary">
                                    შედით თქვენს ანგარიშში
                                </h2>

                                <p className="mt-2 text-sm leading-6 text-text-secondary">
                                    გამოიყენეთ რეგისტრაციისას მითითებული
                                    ელფოსტა და პაროლი.
                                </p>
                            </div>

                            <fieldset
                                disabled={loading}
                                className="grid min-w-0 gap-4"
                            >
                                <div>
                                    <label
                                        htmlFor="login-email"
                                        className="mb-2 block text-sm font-medium text-text-primary"
                                    >
                                        ელფოსტა
                                    </label>

                                    <input
                                        id="login-email"
                                        name="email"
                                        type="email"
                                        autoComplete="username"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        required
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                            setError("");
                                        }}
                                        placeholder="მაგ. name@example.com"
                                        className={inputClass}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="login-password"
                                        className="mb-2 block text-sm font-medium text-text-primary"
                                    >
                                        პაროლი
                                    </label>

                                    <div className="relative">
                                        <input
                                            id="login-password"
                                            name="password"
                                            type={
                                                showPassword
                                                    ? "text"
                                                    : "password"
                                            }
                                            autoComplete="current-password"
                                            required
                                            value={password}
                                            onChange={(event) => {
                                                setPassword(event.target.value);
                                                setError("");
                                            }}
                                            placeholder="შეიყვანეთ პაროლი"
                                            className={`${inputClass} pr-24`}
                                        />

                                        <button
                                            type="button"
                                            aria-controls="login-password"
                                            aria-label={
                                                showPassword
                                                    ? "პაროლის დამალვა"
                                                    : "პაროლის ჩვენება"
                                            }
                                            onClick={() =>
                                                setShowPassword(
                                                    (previous) => !previous
                                                )
                                            }
                                            className="absolute inset-y-0 right-3 my-auto h-8 rounded px-2 text-xs font-medium text-text-secondary transition hover:text-accent"
                                        >
                                            {showPassword
                                                ? "დამალვა"
                                                : "ჩვენება"}
                                        </button>
                                    </div>
                                </div>
                            </fieldset>

                            {error && (
                                <div
                                    role="alert"
                                    className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
                                >
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={
                                    loading || !email.trim() || !password
                                }
                                className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary"
                            >
                                {loading ? "მიმდინარეობს..." : "შესვლა"}
                            </button>

                            <p className="mt-6 text-center text-sm text-text-secondary">
                                ჯერ არ გაქვთ ანგარიში?{" "}
                                <Link
                                    href="/register"
                                    className="font-medium text-accent transition-colors hover:text-accent-hover"
                                >
                                    რეგისტრაცია
                                </Link>
                            </p>
                        </form>
                    </div>
                </section>
            </div>
        </main>
    );
}