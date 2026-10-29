"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import AuthShell, {
    authCardClass,
    authErrorClass,
    authInputClass,
    authLabelClass,
    authPrimaryButtonClass,
} from "@/components/auth/AuthShell";

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

    return (
        <AuthShell
            heading={<>თქვენი ბიზნესი.<br />ყველაფერი ერთ სივრცეში.</>}
            text="შედით თქვენს ანგარიშზე და გააგრძელეთ ბიზნესის მართვა."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleLogin();
                }}
                aria-busy={loading}
                className={authCardClass}
            >
                <div className="mb-7">
                    <h2 className="text-2xl font-semibold text-text-primary">
                        მოგესალმებით MARTEO-ზე
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
                            className={authLabelClass}
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
                            className={authInputClass()}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="login-password"
                            className={authLabelClass}
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
                                className={`${authInputClass()} pr-24`}
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

                <div className="mt-2 flex justify-end">
                    <Link
                        href="/forgot-password"
                        className="inline-flex min-h-10 items-center text-sm text-accent hover:text-accent-hover"
                    >
                        დამავიწყდა პაროლი
                    </Link>
                </div>

                {error && (
                    <div
                        role="alert"
                        className={`mt-4 ${authErrorClass}`}
                    >
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={
                        loading || !email.trim() || !password
                    }
                    className={`mt-5 ${authPrimaryButtonClass}`}
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
        </AuthShell>
    );
}
