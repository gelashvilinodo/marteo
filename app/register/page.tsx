"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";

import OtpInput from "@/components/auth/OtpInput";

type RegistrationForm = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
};

type Field = keyof RegistrationForm;
type TouchedFields = Partial<Record<Field, boolean>>;

type Phase = "details" | "email" | "phone" | "complete";

type Action =
    | "register"
    | "verify-email"
    | "resend-email"
    | "send-phone"
    | "verify-phone";

const EMPTY_FORM: RegistrationForm = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
};

const API = {
    register: "/api/auth/register",
    verifyEmail: "/api/auth/verify-email-code",
    resendEmail: "/api/auth/resend-email-code",
    sendPhone: "/api/auth/resend-phone-code",
    verifyPhone: "/api/auth/verify-phone",
};

const emptyCode = (): string[] => Array(6).fill("");
const isCompleteCode = (value: string[]) =>
    value.length === 6 && value.every((digit) => /^\d$/.test(digit));

class ApiError extends Error {
    constructor(
        message: string,
        readonly retryAfter: number = 0
    ) {
        super(message);
        this.name = "ApiError";
    }
}

function parseRetryAfter(value: string | null): number {
    if (!value) return 0;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return Math.max(0, Math.ceil(numeric));
    }

    const date = Date.parse(value);
    return Number.isFinite(date)
        ? Math.max(0, Math.ceil((date - Date.now()) / 1000))
        : 0;
}

async function post(
    url: string,
    body: Record<string, string>,
    fallback: string
): Promise<Record<string, unknown>> {
    let response: Response;

    try {
        response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error(
            "სერვერთან დაკავშირება ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა."
        );
    }

    const raw: unknown = await response.json().catch(() => null);

    const data: Record<string, unknown> =
        raw !== null && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};

    if (!response.ok) {
        throw new ApiError(
            typeof data.error === "string" && data.error
                ? data.error
                : fallback,
            parseRetryAfter(response.headers.get("Retry-After"))
        );
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("სერვერის პასუხი ვერ დამუშავდა.");
    }

    if (typeof data.error === "string" && data.error) {
        throw new ApiError(data.error);
    }

    return data;
}

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "დაფიქსირდა ტექნიკური შეცდომა.";
}

// This timer updates only the local countdown; it makes no API requests.
function useCooldown() {
    const deadline = useRef(0);
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (seconds <= 0) return;

        const timer = window.setTimeout(() => {
            setSeconds(
                Math.max(
                    0,
                    Math.ceil((deadline.current - Date.now()) / 1000)
                )
            );
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [seconds]);

    const start = (duration = 60) => {
        const next = Math.max(0, Math.ceil(duration));
        deadline.current = Date.now() + next * 1000;
        setSeconds(next);
    };

    return { seconds, start };
}

function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 9);

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) {
        return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    }

    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function getPasswordRules(password: string) {
    return {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
    };
}

function validateField(field: Field, form: RegistrationForm): string {
    switch (field) {
        case "firstName":
            return form.firstName.trim()
                ? ""
                : "გთხოვთ შეიყვანოთ სახელი";

        case "lastName":
            return form.lastName.trim()
                ? ""
                : "გთხოვთ შეიყვანოთ გვარი";

        case "email":
            if (!form.email.trim()) return "გთხოვთ შეიყვანოთ ელფოსტა";
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
                ? ""
                : "გთხოვთ შეიყვანოთ სწორი ელფოსტა";

        case "phone":
            if (!form.phone.trim()) {
                return "გთხოვთ შეიყვანოთ ტელეფონის ნომერი";
            }
            return /^\d{9}$/.test(form.phone.replace(/\s/g, ""))
                ? ""
                : "ტელეფონის ნომერი უნდა შეიცავდეს 9 ციფრს";

        case "password":
            if (!form.password) return "გთხოვთ შეიყვანოთ პაროლი";
            return Object.values(getPasswordRules(form.password)).every(Boolean)
                ? ""
                : "პაროლი უნდა აკმაყოფილებდეს ქვემოთ ჩამოთვლილ მოთხოვნებს";

        case "confirmPassword":
            if (!form.confirmPassword) return "გთხოვთ გაიმეოროთ პაროლი";
            return form.confirmPassword === form.password
                ? ""
                : "პაროლები არ ემთხვევა";
    }
}

function Logo() {
    return (
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
    );
}

function Progress({ step }: { step: 1 | 2 }) {
    return (
        <div className="mb-5">
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-text-secondary">
                <span>ნაბიჯი {step} / 3</span>
                <span>
                    {step === 1 ? "პირადი ინფორმაცია" : "ვერიფიკაცია"}
                </span>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                    className={`h-full rounded-full bg-accent ${
                        step === 1 ? "w-1/3" : "w-2/3"
                    }`}
                />
            </div>
        </div>
    );
}

function ErrorNotice({ message }: { message: string }) {
    if (!message) return null;

    return (
        <p role="alert" className="mt-3 text-sm text-red-500">
            {message}
        </p>
    );
}

export default function RegisterPage() {
    const [form, setForm] = useState<RegistrationForm>(EMPTY_FORM);
    const [touched, setTouched] = useState<TouchedFields>({});
    const [phase, setPhase] = useState<Phase>("details");
    const [userId, setUserId] = useState("");

    const [action, setAction] = useState<Action | null>(null);
    const requestLocked = useRef(false);

    const [apiError, setApiError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [phoneError, setPhoneError] = useState("");

    const [emailCode, setEmailCode] = useState<string[]>(emptyCode);
    const [phoneCode, setPhoneCode] = useState<string[]>(emptyCode);
    const [phoneSent, setPhoneSent] = useState(false);

    const emailCooldown = useCooldown();
    const phoneCooldown = useCooldown();

    const busy = action !== null;
    const finished = phase === "complete";
    const emailVerified = phase === "phone" || finished;
    const passwordRules = getPasswordRules(form.password);

    const isFormValid = (
        Object.keys(EMPTY_FORM) as Field[]
    ).every((field) => !validateField(field, form));

    const updateField = (field: Field, value: string) => {
        setForm((previous) => ({ ...previous, [field]: value }));
        setApiError("");
    };

    const handleBlur = (field: Field) => {
        setTouched((previous) => ({ ...previous, [field]: true }));
    };

    const inputClass = (field: Field) => {
        const invalid = touched[field] && validateField(field, form);

        return `w-full rounded-xl border bg-background px-4 py-3.5 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 ${
            invalid
                ? "border-red-500 focus:border-red-500"
                : "border-border focus:border-accent focus:ring-2 focus:ring-accent/10"
        }`;
    };

    const fieldError = (field: Field) => {
        const message = touched[field] && validateField(field, form);

        return message ? (
            <p
                id={`${field}-error`}
                className="mt-1.5 text-xs text-red-500"
            >
                {message}
            </p>
        ) : null;
    };

    const runAction = async (
        nextAction: Action,
        task: () => Promise<void>,
        reportError: (message: string) => void
    ) => {
        // The ref also blocks rapid clicks before React renders.
        if (requestLocked.current) return;

        requestLocked.current = true;
        setAction(nextAction);
        reportError("");

        try {
            await task();
        } catch (error) {
            reportError(errorMessage(error));

            if (error instanceof ApiError && error.retryAfter > 0) {
                if (nextAction === "resend-email") {
                    emailCooldown.start(error.retryAfter);
                }
                if (nextAction === "send-phone") {
                    phoneCooldown.start(error.retryAfter);
                }
            }
        } finally {
            requestLocked.current = false;
            setAction(null);
        }
    };

    const handleContinue = async () => {
        if (phase !== "details" || requestLocked.current) return;

        setTouched({
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            password: true,
            confirmPassword: true,
        });

        if (!isFormValid) return;

        const submitted = {
            ...form,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim().toLowerCase(),
        };

        await runAction(
            "register",
            async () => {
                const data = await post(
                    API.register,
                    {
                        firstName: submitted.firstName,
                        lastName: submitted.lastName,
                        email: submitted.email,
                        phone: `+995${submitted.phone.replace(/\s/g, "")}`,
                        password: submitted.password,
                    },
                    "რეგისტრაცია ვერ შესრულდა."
                );

                if (
                    typeof data.userId !== "string" ||
                    !data.userId.trim()
                ) {
                    throw new Error("მომხმარებლის მონაცემი ვერ მოიძებნა.");
                }

                setUserId(data.userId);
                setForm({
                    ...submitted,
                    password: "",
                    confirmPassword: "",
                });
                setEmailCode(emptyCode());
                setPhoneCode(emptyCode());
                setEmailError("");
                setPhoneError("");
                setPhoneSent(false);
                emailCooldown.start();
                setPhase("email");
            },
            setApiError
        );
    };

    const sendPhoneCode = async () => {
        await post(
            API.sendPhone,
            { userId },
            "SMS კოდის გაგზავნა ვერ მოხერხდა."
        );

        setPhoneSent(true);
        setPhoneCode(emptyCode());
        setPhoneError("");
        phoneCooldown.start();
    };

    const handleVerifyEmail = async () => {
        if (
            phase !== "email" ||
            !userId ||
            !isCompleteCode(emailCode)
        ) {
            return;
        }

        await runAction(
            "verify-email",
            async () => {
                await post(
                    API.verifyEmail,
                    { userId, code: emailCode.join("") },
                    "ელფოსტის დადასტურება ვერ მოხერხდა."
                );

                setEmailCode(emptyCode());
                setPhase("phone");
                setPhoneError("");
                setAction("send-phone");

                // Email verification remains successful if SMS sending fails.
                try {
                    await sendPhoneCode();
                } catch (error) {
                    setPhoneError(errorMessage(error));

                    if (
                        error instanceof ApiError &&
                        error.retryAfter > 0
                    ) {
                        phoneCooldown.start(error.retryAfter);
                    }
                }
            },
            setEmailError
        );
    };

    const handleResendEmail = async () => {
        if (
            phase !== "email" ||
            !userId ||
            emailCooldown.seconds > 0
        ) {
            return;
        }

        await runAction(
            "resend-email",
            async () => {
                await post(
                    API.resendEmail,
                    { userId },
                    "ელფოსტის კოდის ხელახლა გაგზავნა ვერ მოხერხდა."
                );

                setEmailCode(emptyCode());
                emailCooldown.start();
            },
            setEmailError
        );
    };

    const handleResendPhone = async () => {
        if (
            phase !== "phone" ||
            !userId ||
            phoneCooldown.seconds > 0
        ) {
            return;
        }

        await runAction("send-phone", sendPhoneCode, setPhoneError);
    };

    const handleVerifyPhone = async () => {
        if (
            phase !== "phone" ||
            !userId ||
            !isCompleteCode(phoneCode)
        ) {
            return;
        }

        await runAction(
            "verify-phone",
            async () => {
                const data = await post(
                    API.verifyPhone,
                    { userId, code: phoneCode.join("") },
                    "ტელეფონის დადასტურება ვერ მოხერხდა."
                );

                if (data.phoneVerified !== true) {
                    throw new Error(
                        "სერვერმა ტელეფონის დადასტურება ვერ დაადასტურა."
                    );
                }

                setPhase("complete");
                window.location.replace("/business/onboarding");
            },
            setPhoneError
        );
    };

    const renderInput = (
        field: Exclude<Field, "phone">,
        label: string,
        placeholder: string,
        type = "text",
        autoComplete = "off"
    ) => (
        <>
            <label
                htmlFor={field}
                className="mb-2 block text-sm font-medium text-text-primary"
            >
                {label}
            </label>
            <input
                id={field}
                name={field}
                type={type}
                autoComplete={autoComplete}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                onBlur={() => handleBlur(field)}
                placeholder={placeholder}
                aria-invalid={
                    Boolean(touched[field] && validateField(field, form))
                }
                aria-describedby={
                    touched[field] && validateField(field, form)
                        ? `${field}-error`
                        : undefined
                }
                className={inputClass(field)}
            />
        </>
    );

    return (
        <main className="min-h-screen bg-background">
            {phase !== "details" ? (
                <div className="flex min-h-screen items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md">
                        <div className="mb-8 flex justify-center">
                            <Logo />
                        </div>

                        <Progress step={2} />

                        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                            <div className="mb-7 text-center">
                                <h1 className="text-2xl font-semibold text-text-primary">
                                    ანგარიშის ვერიფიკაცია
                                </h1>
                                <p className="mt-2 text-sm leading-6 text-text-secondary">
                                    თქვენი ანგარიშის დასაცავად საჭიროა ელფოსტისა და
                                    ტელეფონის ნომრის დადასტურება.
                                </p>
                            </div>

                            {/* Email verification */}
                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                                            emailVerified
                                                ? "bg-green-500/10 text-green-600"
                                                : "bg-accent/10 text-accent"
                                        }`}
                                    >
                                        <Icon
                                            icon={
                                                emailVerified
                                                    ? "solar:check-circle-bold"
                                                    : "solar:letter-bold"
                                            }
                                            className="h-5 w-5"
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className="text-sm font-semibold text-text-primary">
                                            ელფოსტის დადასტურება
                                        </h2>
                                        <p
                                            className={`mt-1 text-sm leading-6 ${
                                                emailVerified
                                                    ? "font-medium text-green-600"
                                                    : "text-text-secondary"
                                            }`}
                                        >
                                            {emailVerified
                                                ? "ელფოსტა წარმატებით დადასტურდა."
                                                : "შეიყვანეთ ელფოსტაზე გამოგზავნილი 6-ნიშნა კოდი."}
                                        </p>
                                        <p className="mt-2 break-all text-sm font-medium text-text-primary">
                                            {form.email}
                                        </p>
                                    </div>
                                </div>

                                {!emailVerified && (
                                    <form
                                        className="mt-5"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void handleVerifyEmail();
                                        }}
                                    >
                                        <OtpInput
                                            idPrefix="email"
                                            value={emailCode}
                                            onChange={(value) => {
                                                setEmailCode(value);
                                                setEmailError("");
                                            }}
                                            disabled={busy}
                                        />

                                        <ErrorNotice message={emailError} />

                                        <div
                                            className="mt-4 text-center text-sm"
                                            aria-live="off"
                                        >
                                            {emailCooldown.seconds > 0 ? (
                                                <span className="text-text-secondary">
                                                    კოდის ხელახლა გაგზავნა შესაძლებელი იქნება{" "}
                                                    {emailCooldown.seconds} წამში
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleResendEmail}
                                                    disabled={busy}
                                                    className="font-medium text-accent hover:underline disabled:opacity-50"
                                                >
                                                    {action === "resend-email"
                                                        ? "იგზავნება..."
                                                        : "კოდის ხელახლა გაგზავნა"}
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={
                                                busy ||
                                                !isCompleteCode(emailCode)
                                            }
                                            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {action === "verify-email"
                                                ? "მიმდინარეობს..."
                                                : "ელფოსტის დადასტურება"}
                                        </button>
                                    </form>
                                )}

                                {emailVerified && (
                                    <div
                                        role="status"
                                        className="mt-4 flex items-center gap-2 text-xs font-medium text-green-600"
                                    >
                                        <Icon
                                            icon="solar:check-circle-bold"
                                            className="h-4 w-4"
                                        />
                                        <span>დადასტურებულია</span>
                                    </div>
                                )}
                            </div>

                            {/* Phone verification */}
                            <div
                                className={`mt-4 rounded-xl border border-border bg-background p-4 ${
                                    emailVerified ? "" : "opacity-50"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                                        <Icon
                                            icon="solar:phone-bold"
                                            className="h-5 w-5"
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className="text-sm font-semibold text-text-primary">
                                            ტელეფონის დადასტურება
                                        </h2>
                                        <p
                                            role="status"
                                            className="mt-1 text-sm leading-6 text-text-secondary"
                                        >
                                            {!emailVerified
                                                ? "ჯერ დაადასტურეთ ელფოსტა."
                                                : finished
                                                  ? "ტელეფონი წარმატებით დადასტურდა."
                                                  : action === "send-phone"
                                                    ? "SMS კოდი იგზავნება..."
                                                    : phoneSent
                                                      ? "შეიყვანეთ SMS-ით მიღებული 6-ნიშნა კოდი."
                                                      : "მოითხოვეთ SMS კოდი ან შეიყვანეთ უკვე მიღებული კოდი."}
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-text-primary">
                                            +995 {form.phone}
                                        </p>
                                    </div>
                                </div>

                                <form
                                    className="mt-5"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void handleVerifyPhone();
                                    }}
                                >
                                    <OtpInput
                                        idPrefix="phone"
                                        value={phoneCode}
                                        onChange={(value) => {
                                            setPhoneCode(value);
                                            setPhoneError("");
                                        }}
                                        disabled={
                                            !emailVerified || busy || finished
                                        }
                                    />

                                    <ErrorNotice message={phoneError} />

                                    {emailVerified && !finished && (
                                        <div
                                            className="mt-4 text-center text-sm"
                                            aria-live="off"
                                        >
                                            {phoneCooldown.seconds > 0 ? (
                                                <span className="text-text-secondary">
                                                    კოდის ხელახლა გაგზავნა შესაძლებელი იქნება{" "}
                                                    {phoneCooldown.seconds} წამში
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleResendPhone}
                                                    disabled={busy}
                                                    className="font-medium text-accent hover:underline disabled:opacity-50"
                                                >
                                                    {action === "send-phone"
                                                        ? "იგზავნება..."
                                                        : phoneSent
                                                          ? "კოდის ხელახლა გაგზავნა"
                                                          : "SMS კოდის გაგზავნა"}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={
                                            !emailVerified ||
                                            busy ||
                                            finished ||
                                            !isCompleteCode(phoneCode)
                                        }
                                        className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {finished
                                            ? "გადამისამართება..."
                                            : action === "verify-phone"
                                              ? "მიმდინარეობს..."
                                              : "ტელეფონის დადასტურება"}
                                    </button>
                                </form>
                            </div>

                            <div className="mt-5 rounded-xl bg-accent/5 px-4 py-3">
                                <p className="text-xs leading-5 text-text-secondary">
                                    ვერიფიკაციის დასრულების შემდეგ გადახვალთ
                                    ბიზნესის ინფორმაციის შევსებაზე.
                                </p>
                            </div>
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
                                შექმენით ანგარიში და მიიღეთ წვდომა ბიზნესის
                                მართვის თანამედროვე ინსტრუმენტებზე.
                            </p>
                        </div>

                        <p className="text-sm text-white/40">
                            © {new Date().getFullYear()} MARTEO.GE
                        </p>
                    </section>

                    {/* Right panel */}
                    <section className="flex min-h-screen items-center justify-center px-4 py-4 sm:px-6 lg:px-10 xl:px-12">
                        <div className="w-full max-w-xl">
                            <div className="mb-8 flex justify-center lg:hidden">
                                <Logo />
                            </div>

                            <Progress step={1} />

                            <form
                                className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
                                noValidate
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void handleContinue();
                                }}
                            >
                                <div className="mb-7">
                                    <h2 className="text-2xl font-semibold text-text-primary">
                                        შექმენით თქვენი ანგარიში
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                                        შეავსეთ პირადი ინფორმაცია რეგისტრაციის
                                        დასაწყებად.
                                    </p>
                                </div>

                                <fieldset
                                    disabled={busy}
                                    className="grid min-w-0 gap-4 sm:grid-cols-2"
                                >
                                    <div>
                                        {renderInput(
                                            "firstName",
                                            "სახელი",
                                            "შეიყვანეთ სახელი",
                                            "text",
                                            "given-name"
                                        )}
                                        {fieldError("firstName")}
                                    </div>

                                    <div>
                                        {renderInput(
                                            "lastName",
                                            "გვარი",
                                            "შეიყვანეთ გვარი",
                                            "text",
                                            "family-name"
                                        )}
                                        {fieldError("lastName")}
                                    </div>

                                    <div className="sm:col-span-2">
                                        {renderInput(
                                            "email",
                                            "ელფოსტა",
                                            "მაგ. name@example.com",
                                            "email",
                                            "email"
                                        )}
                                        {fieldError("email")}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label
                                            htmlFor="phone"
                                            className="mb-2 block text-sm font-medium text-text-primary"
                                        >
                                            ტელეფონის ნომერი
                                        </label>

                                        <div
                                            className={`flex overflow-hidden rounded-xl border bg-background transition-all ${
                                                touched.phone &&
                                                validateField("phone", form)
                                                    ? "border-red-500"
                                                    : "border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10"
                                            }`}
                                        >
                                            <div className="flex items-center border-r border-border px-4 text-sm font-medium text-text-secondary">
                                                +995
                                            </div>
                                            <input
                                                id="phone"
                                                name="phone"
                                                type="tel"
                                                inputMode="numeric"
                                                autoComplete="tel-national"
                                                value={form.phone}
                                                onChange={(event) =>
                                                    updateField(
                                                        "phone",
                                                        formatPhone(
                                                            event.target.value
                                                        )
                                                    )
                                                }
                                                onBlur={() =>
                                                    handleBlur("phone")
                                                }
                                                aria-invalid={Boolean(
                                                    touched.phone &&
                                                    validateField("phone", form)
                                                )}
                                                aria-describedby={
                                                    touched.phone &&
                                                    validateField("phone", form)
                                                        ? "phone-error"
                                                        : undefined
                                                }
                                                placeholder="555 123 456"
                                                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary/70"
                                            />
                                        </div>

                                        {fieldError("phone")}
                                    </div>

                                    <div className="sm:col-span-2">
                                        {renderInput(
                                            "password",
                                            "პაროლი",
                                            "შეიყვანეთ პაროლი",
                                            "password",
                                            "new-password"
                                        )}

                                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                                            {(
                                                [
                                                    ["length", "მინიმუმ 8 სიმბოლო"],
                                                    ["uppercase", "ერთი დიდი ასო"],
                                                    ["lowercase", "ერთი პატარა ასო"],
                                                    ["number", "ერთი ციფრი"],
                                                ] as const
                                            ).map(([key, label]) => {
                                                const valid = passwordRules[key];

                                                return (
                                                    <div
                                                        key={key}
                                                        className={`flex items-center gap-2 text-xs ${
                                                            valid
                                                                ? "text-accent"
                                                                : "text-text-secondary"
                                                        }`}
                                                    >
                                                        <span
                                                            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                                                                valid
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

                                        {fieldError("password")}
                                    </div>

                                    <div className="sm:col-span-2">
                                        {renderInput(
                                            "confirmPassword",
                                            "გაიმეორეთ პაროლი",
                                            "გაიმეორეთ პაროლი",
                                            "password",
                                            "new-password"
                                        )}
                                        {fieldError("confirmPassword")}
                                    </div>
                                </fieldset>

                                {apiError && (
                                    <div
                                        role="alert"
                                        className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
                                    >
                                        {apiError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={!isFormValid || busy}
                                    className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary"
                                >
                                    {action === "register"
                                        ? "მიმდინარეობს..."
                                        : "გაგრძელება"}
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
                            </form>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}