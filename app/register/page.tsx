"use client";

import Link from "next/link";
import { useState } from "react";

type FormData = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
};

type TouchedFields = Partial<Record<keyof FormData, boolean>>;

export default function RegisterPage() {
    const [form, setForm] = useState<FormData>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
    });

    const [touched, setTouched] = useState<TouchedFields>({});

    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState("");
    const [step, setStep] = useState(1);
    const [userId, setUserId] = useState("");

    const updateField = (field: keyof FormData, value: string) => {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const validateField = (field: keyof FormData) => {
        const value = form[field].trim();

        switch (field) {
            case "firstName":
                return value ? "" : "გთხოვთ შეიყვანოთ სახელი";

            case "lastName":
                return value ? "" : "გთხოვთ შეიყვანოთ გვარი";

            case "email":
                if (!value) return "გთხოვთ შეიყვანოთ ელფოსტა";
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    return "გთხოვთ შეიყვანოთ სწორი ელფოსტა";
                }
                return "";

            case "phone":
                if (!value) return "გთხოვთ შეიყვანოთ ტელეფონის ნომერი";
                if (!/^\d{9}$/.test(value.replace(/\s/g, ""))) {
                    return "ტელეფონის ნომერი უნდა შეიცავდეს 9 ციფრს";
                }
                return "";

            case "password":
                if (!value) return "გთხოვთ შეიყვანოთ პაროლი";
                if (value.length < 8) return "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს";
                return "";

            case "confirmPassword":
                if (!value) return "გთხოვთ გაიმეოროთ პაროლი";
                if (value !== form.password) return "პაროლები არ ემთხვევა";
                return "";

            default:
                return "";
        }
    };

    const getPasswordRules = () => ({
        length: form.password.length >= 8,
        uppercase: /[A-Z]/.test(form.password),
        lowercase: /[a-z]/.test(form.password),
        number: /\d/.test(form.password),
    });

    const passwordRules = getPasswordRules();

    const isFormValid =
        form.firstName.trim() &&
        form.lastName.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
        /^\d{9}$/.test(form.phone.replace(/\s/g, "")) &&
        passwordRules.length &&
        passwordRules.uppercase &&
        passwordRules.lowercase &&
        passwordRules.number &&
        form.confirmPassword === form.password;

    const handleBlur = (field: keyof FormData) => {
        setTouched((prev) => ({
            ...prev,
            [field]: true,
        }));
    };

    const handleContinue = async () => {
        const allTouched: TouchedFields = {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            password: true,
            confirmPassword: true,
        };

        setTouched(allTouched);
        setApiError("");

        if (!isFormValid || loading) return;

        setLoading(true);

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim().toLowerCase(),
                    phone: `+995${form.phone.replace(/\s/g, "")}`,
                    password: form.password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setApiError(data.error || "რეგისტრაცია ვერ შესრულდა");
                return;
            }

            console.log("Registration successful:", data);

            setUserId(data.userId);
            setStep(2);

            // Step 2-ს შემდეგ დავამატებთ.
        } catch {
            setApiError("დაფიქსირდა ტექნიკური შეცდომა. გთხოვთ სცადოთ თავიდან.");
        } finally {
            setLoading(false);
        }
    };

    const formatPhone = (value: string) => {
        const digits = value.replace(/\D/g, "").slice(0, 9);

        if (digits.length <= 3) return digits;
        if (digits.length <= 6) {
            return `${digits.slice(0, 3)} ${digits.slice(3)}`;
        }

        return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    };

    const inputClass = (field: keyof FormData) => {
        const error = touched[field] && validateField(field);

        return `w-full rounded-xl border bg-background px-4 py-3.5 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 ${error
            ? "border-red-500 focus:border-red-500"
            : "border-border focus:border-accent focus:ring-2 focus:ring-accent/10"
            }`;
    };

    const errorText = (field: keyof FormData) => {
        const error = touched[field] && validateField(field);

        if (!error) return null;

        return <p className="mt-1.5 text-xs text-red-500">{error}</p>;
    };

    return (
        <main className="min-h-screen bg-background">
            {step === 2 ? (
                <div className="flex min-h-screen items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                        <div className="mb-8 text-center">
                            <h1 className="text-2xl font-semibold text-text-primary">
                                ანგარიშის ვერიფიკაცია
                            </h1>

                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                                ელფოსტაზე გამოგზავნილი კოდით დაადასტურეთ თქვენი ანგარიში.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border bg-background p-4 text-sm text-text-secondary">
                            ვერიფიკაციის ფორმა შემდეგ ეტაპზე დაემატება.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
                    {/* Left panel */}
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
                                დაიწყეთ თქვენი ბიზნესის
                                <br />
                                მართვა მარტივად.
                            </h1>

                            <p className="mt-6 max-w-sm text-base leading-7 text-white/65">
                                შექმენით ანგარიში და მიიღეთ წვდომა ბიზნესის მართვის თანამედროვე
                                ინსტრუმენტებზე.
                            </p>
                        </div>

                        <p className="text-sm text-white/40">
                            © {new Date().getFullYear()} MARTEO.GE
                        </p>
                    </section>

                    {/* Right side */}
                    <section className="flex min-h-screen items-center justify-center px-4 py-4 sm:px-6 lg:px-10 xl:px-12">
                        <div className="w-full max-w-xl">
                            {/* Mobile logo */}
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

                            {/* Progress */}
                            <div className="mb-5">
                                <div className="mb-3 flex items-center justify-between text-xs font-medium text-text-secondary">
                                    <span>ნაბიჯი 1 / 3</span>
                                    <span>პირადი ინფორმაცია</span>
                                </div>

                                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                                    <div className="h-full w-1/3 rounded-full bg-accent" />
                                </div>
                            </div>

                            {/* Card */}
                            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                                <div className="mb-7">
                                    <h2 className="text-2xl font-semibold text-text-primary">
                                        შექმენით თქვენი ანგარიში
                                    </h2>

                                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                                        შეავსეთ პირადი ინფორმაცია რეგისტრაციის დასაწყებად.
                                    </p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    {/* First name */}
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            სახელი
                                        </label>

                                        <input
                                            type="text"
                                            value={form.firstName}
                                            onChange={(e) =>
                                                updateField("firstName", e.target.value)
                                            }
                                            onBlur={() => handleBlur("firstName")}
                                            placeholder="შეიყვანეთ სახელი"
                                            className={inputClass("firstName")}
                                        />

                                        {errorText("firstName")}
                                    </div>

                                    {/* Last name */}
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            გვარი
                                        </label>

                                        <input
                                            type="text"
                                            value={form.lastName}
                                            onChange={(e) =>
                                                updateField("lastName", e.target.value)
                                            }
                                            onBlur={() => handleBlur("lastName")}
                                            placeholder="შეიყვანეთ გვარი"
                                            className={inputClass("lastName")}
                                        />

                                        {errorText("lastName")}
                                    </div>

                                    {/* Email */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            ელფოსტა
                                        </label>

                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => updateField("email", e.target.value)}
                                            onBlur={() => handleBlur("email")}
                                            placeholder="მაგ. name@example.com"
                                            className={inputClass("email")}
                                        />

                                        {errorText("email")}
                                    </div>

                                    {/* Phone */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            ტელეფონის ნომერი
                                        </label>

                                        <div
                                            className={`flex overflow-hidden rounded-xl border bg-background transition-all ${touched.phone && validateField("phone")
                                                ? "border-red-500"
                                                : "border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10"
                                                }`}
                                        >
                                            <div className="flex items-center border-r border-border px-4 text-sm font-medium text-text-secondary">
                                                +995
                                            </div>

                                            <input
                                                type="tel"
                                                inputMode="numeric"
                                                value={form.phone}
                                                onChange={(e) =>
                                                    updateField("phone", formatPhone(e.target.value))
                                                }
                                                onBlur={() => handleBlur("phone")}
                                                placeholder="555 123 456"
                                                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary/70"
                                            />
                                        </div>

                                        {errorText("phone")}
                                    </div>

                                    {/* Password */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            პაროლი
                                        </label>

                                        <input
                                            type="password"
                                            value={form.password}
                                            onChange={(e) =>
                                                updateField("password", e.target.value)
                                            }
                                            onBlur={() => handleBlur("password")}
                                            placeholder="შეიყვანეთ პაროლი"
                                            className={inputClass("password")}
                                        />

                                        {/* Password rules */}
                                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                                            {[
                                                ["length", "მინიმუმ 8 სიმბოლო"],
                                                ["uppercase", "ერთი დიდი ასო"],
                                                ["lowercase", "ერთი პატარა ასო"],
                                                ["number", "ერთი ციფრი"],
                                            ].map(([key, label]) => {
                                                const valid =
                                                    passwordRules[key as keyof typeof passwordRules];

                                                return (
                                                    <div
                                                        key={key}
                                                        className={`flex items-center gap-2 text-xs ${valid
                                                            ? "text-accent"
                                                            : "text-text-secondary"
                                                            }`}
                                                    >
                                                        <span
                                                            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${valid
                                                                ? "bg-accent text-white"
                                                                : "border border-border"
                                                                }`}
                                                        >
                                                            {valid ? "✓" : ""}
                                                        </span>

                                                        <span>{label}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {errorText("password")}
                                    </div>

                                    {/* Confirm password */}
                                    <div className="sm:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-text-primary">
                                            გაიმეორეთ პაროლი
                                        </label>

                                        <input
                                            type="password"
                                            value={form.confirmPassword}
                                            onChange={(e) =>
                                                updateField("confirmPassword", e.target.value)
                                            }
                                            onBlur={() => handleBlur("confirmPassword")}
                                            placeholder="გაიმეორეთ პაროლი"
                                            className={inputClass("confirmPassword")}
                                        />

                                        {errorText("confirmPassword")}
                                    </div>
                                </div>

                                {apiError && (
                                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                                        {apiError}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleContinue}
                                    disabled={!isFormValid || loading}
                                    className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary"
                                >
                                    {loading ? "მიმდინარეობს..." : "გაგრძელება"}
                                </button>

                                <p className="mt-6 text-center text-sm text-text-secondary">
                                    უკვე გაქვთ ანგარიში?{" "}
                                    <Link
                                        href="/login"
                                        className="font-medium text-accent transition-colors hover:text-accent-hover"
                                    >
                                        შესვლა
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}