"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@iconify/react";

import { supabase } from "@/lib/supabase/client";

const businessTypes = [
    "ტანსაცმელი და მოდა",
    "ფეხსაცმელი და აქსესუარები",
    "ჩანთები და აქსესუარები",
    "სამკაული და საათები",
    "კოსმეტიკა და სილამაზე",
    "კვება და სასმელი",
    "რესტორანი / კაფე",
    "ავტომობილები და ავტონაწილები",
    "ელექტრონიკა და ტექნიკა",
    "სახლი და ინტერიერი",
    "ჯანმრთელობა და ფიტნესი",
    "მშენებლობა და რემონტი",
    "სხვა",
];

export default function BusinessOnboardingPage() {
    const [businessName, setBusinessName] = useState("");
    const [businessType, setBusinessType] = useState("");
    const [otherBusinessType, setOtherBusinessType] = useState("");
    const [logoPreview, setLogoPreview] = useState("");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    const firstLetter =
        businessName.trim().charAt(0).toUpperCase() || "B";

    const canSubmit =
        businessName.trim().length > 0 &&
        businessType.length > 0 &&
        (businessType !== "სხვა" || otherBusinessType.trim().length > 0) &&
        acceptedTerms;

    const handleLogoChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];

        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        if (!allowedTypes.includes(file.type)) {
            setError("ლოგო უნდა იყოს PNG, JPG ან WEBP ფორმატში.");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setError("ლოგოს მაქსიმალური ზომაა 2MB.");
            return;
        }

        setError("");

        setLogoFile(file);

        const previewUrl = URL.createObjectURL(file);
        setLogoPreview(previewUrl);
    };

    const handleSubmit = async () => {
        if (!canSubmit || loading) return;

        setLoading(true);
        setError("");

        try {
            let logoUrl = "";

            if (logoFile) {
                const extension = logoFile.name.split(".").pop();
                const fileName = `${crypto.randomUUID()}.${extension}`;

                const { error: uploadError } = await supabase.storage
                    .from("business-logos")
                    .upload(fileName, logoFile);

                if (uploadError) {
                    setError("ლოგოს ატვირთვა ვერ მოხერხდა.");
                    setLoading(false);
                    return;
                }

                const { data } = supabase.storage
                    .from("business-logos")
                    .getPublicUrl(fileName);

                logoUrl = data.publicUrl;
            }

            const response = await fetch("/api/business/onboarding", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: businessName.trim(),
                    category:
                        businessType === "სხვა"
                            ? otherBusinessType.trim()
                            : businessType,
                    logoUrl,
                }),
            });

            const data = (await response.json()) as {
                error?: string;
                message?: string;
            };

            if (!response.ok) {
                setError(
                    data.error || "ბიზნესის შექმნა ვერ მოხერხდა."
                );
                return;
            }

            setSuccess(true);

            setTimeout(() => {
                window.location.href = "/dashboard";
            }, 1500);

        } catch {
            setError("დაფიქსირდა ტექნიკური შეცდომა.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-background">

            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-lg">
                        <Icon
                            icon="solar:refresh-circle-bold"
                            className="h-6 w-6 animate-spin text-accent"
                        />

                        <span className="text-sm font-medium text-text-primary">
                            ბიზნესის შექმნა...
                        </span>
                    </div>
                </div>
            )}

            {success && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-xl">

                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                            <Icon
                                icon="solar:check-circle-bold"
                                className="h-12 w-12 animate-[successPop_.35s_ease-out] text-green-600"
                            />
                        </div>

                        <h2 className="mt-6 text-xl font-semibold text-text-primary">
                            ბიზნესი წარმატებით შეიქმნა
                        </h2>

                        <p className="mt-2 text-sm text-text-secondary">
                            რამდენიმე წამში გადაგიყვანთ Dashboard-ზე...
                        </p>
                    </div>
                </div>
            )}

            <div className="flex min-h-screen items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="mb-8 flex justify-center">
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
                            <span>ნაბიჯი 3 / 3</span>
                            <span>ბიზნესის ინფორმაცია</span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-border">
                            <div className="h-full w-full rounded-full bg-accent" />
                        </div>
                    </div>

                    {/* Card */}
                    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                        <div className="mb-7 text-center">
                            <h1 className="text-2xl font-semibold text-text-primary">
                                ბიზნესის ინფორმაცია
                            </h1>

                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                                შეავსეთ ბიზნესის ძირითადი ინფორმაცია და დაასრულეთ რეგისტრაცია.
                            </p>
                        </div>

                        {/* Logo upload */}
                        <div className="mb-6 flex flex-col items-center">
                            <label className="group cursor-pointer">
                                <div
                                    className={`relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border bg-background text-2xl font-semibold text-text-primary transition-all ${logoPreview
                                        ? "border-green-500"
                                        : "border-border group-hover:border-accent"
                                        }`}
                                >
                                    {logoPreview ? (
                                        <img
                                            src={logoPreview}
                                            alt="ბიზნესის ლოგო"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <span className="transition-opacity group-hover:opacity-0">
                                            {firstLetter}
                                        </span>
                                    )}

                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
                                        <Icon
                                            icon="solar:camera-add-bold"
                                            className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                        />
                                    </div>

                                    {logoPreview && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();

                                                setLogoPreview("");
                                                setLogoFile(null);
                                            }}
                                            className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                                        >
                                            <Icon
                                                icon="solar:close-circle-bold"
                                                className="h-5 w-5"
                                            />
                                        </button>
                                    )}

                                </div>

                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={handleLogoChange}
                                    className="hidden"
                                />
                            </label>

                            <p className="mt-3 text-sm font-medium text-text-primary">
                                ლოგოს ატვირთვა
                            </p>

                            <p className="mt-1 text-xs text-text-secondary">
                                PNG, JPG ან WEBP — არასავალდებულო
                            </p>
                        </div>

                        {/* Business name */}
                        <div className="mb-4">
                            <label className="mb-2 block pl-3 text-sm font-medium text-text-primary">
                                ბიზნესის დასახელება
                            </label>

                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) =>
                                    setBusinessName(e.target.value)
                                }
                                placeholder="მაგ. MARTEO"
                                className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent/10"
                            />
                        </div>

                        {/* Business type */}
                        <div className="mb-4">
                            <label className="mb-2 block pl-3 text-sm font-medium text-text-primary">
                                ბიზნესის ტიპი
                            </label>

                            <div className="relative">
                                <select
                                    value={businessType}
                                    onChange={(e) =>
                                        setBusinessType(e.target.value)
                                    }
                                    className="w-full appearance-none rounded-xl border border-border bg-background py-3.5 pl-4 pr-12 text-sm text-text-primary outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10"
                                >
                                    <option value="">
                                        აირჩიეთ ბიზნესის ტიპი
                                    </option>

                                    {businessTypes.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>

                                <Icon
                                    icon="solar:alt-arrow-down-linear"
                                    className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                                />
                            </div>
                        </div>

                        {/* Other type */}
                        {businessType === "სხვა" && (
                            <div className="mb-4">
                                <label className="mb-2 block pl-3 text-sm font-medium text-text-primary">
                                    მიუთითეთ ბიზნესის ტიპი
                                </label>

                                <input
                                    type="text"
                                    value={otherBusinessType}
                                    onChange={(e) =>
                                        setOtherBusinessType(e.target.value)
                                    }
                                    placeholder="მაგ. ივენთების ორგანიზება"
                                    className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent/10"
                                />
                            </div>
                        )}

                        {/* Terms */}
                        <label className="mt-5 flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) =>
                                    setAcceptedTerms(e.target.checked)
                                }
                                className="mt-1 h-5 w-5 cursor-pointer rounded border-border accent-accent"
                            />

                            <span className="text-sm leading-6 text-text-secondary">
                                ვეთანხმები{" "}
                                <Link
                                    href="/terms"
                                    target="_blank"
                                    className="font-medium text-accent hover:underline"
                                >
                                    წესებსა და პირობებს
                                </Link>
                            </span>
                        </label>

                        {error && (
                            <p className="mt-3 text-sm text-red-500">
                                {error}
                            </p>
                        )}

                        {/* Submit */}
                        <button
                            onClick={handleSubmit}
                            type="button"
                            disabled={!canSubmit || loading}
                            className="mt-6 w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary"
                        >
                            {loading
                                ? "იქმნება..."
                                : "რეგისტრაციის დასრულება"}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}