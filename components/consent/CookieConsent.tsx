"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";

import { disableGoogleAnalytics, enableGoogleAnalytics } from "@/lib/analytics/google-analytics";
import {
    onOpenCookieSettings,
    parseConsent,
    readConsentSnapshot,
    saveConsent,
    subscribeConsent,
} from "@/lib/consent/cookie-consent";

// ბეჭდვის, მომხმარებლის შეკვეთის ბმულისა და ადმინის გვერდებზე ბანერი და ანალიტიკა არ გვჭირდება.
const EXCLUDED_PREFIXES = ["/print", "/o/", "/admin"];

export default function CookieConsent() {
    const pathname = usePathname();
    // სერვერზე undefined — ბანერი მხოლოდ ბრაუზერში, შენახული არჩევანის წაკითხვის შემდეგ ჩნდება.
    const raw = useSyncExternalStore(subscribeConsent, readConsentSnapshot, () => undefined);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const consent = parseConsent(raw);
    const excluded = EXCLUDED_PREFIXES.some(prefix => pathname.startsWith(prefix));

    useEffect(() => onOpenCookieSettings(() => setSettingsOpen(true)), []);

    useEffect(() => {
        if (excluded || !consent) return;
        if (consent.analytics) enableGoogleAnalytics();
        else disableGoogleAnalytics();
    }, [excluded, consent?.analytics]); // eslint-disable-line react-hooks/exhaustive-deps

    if (raw === undefined || excluded || (consent && !settingsOpen)) return null;

    function choose(analytics: boolean) {
        saveConsent(analytics);
        setSettingsOpen(false);
    }

    return (
        <section
            role="dialog"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-text"
            className="landing-hero-enter fixed inset-x-3 bottom-3 z-[90] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[25rem]"
        >
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1.5rem_3rem_-1rem_rgb(15_28_46/0.35)]">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <Icon icon="ph:cookie-duotone" className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id="cookie-consent-title" className="font-semibold text-text-primary">
                            ქუქი-ფაილები
                        </h2>
                        <p id="cookie-consent-text" className="mt-1 text-sm leading-relaxed text-text-secondary">
                            ქუქი-ფაილებით ვიგებთ, როგორ იყენებ საიტს, და მართეოს შენთვის უფრო მოსახერხებელს ვხდით.{" "}
                            <Link href="/cookies" className="font-medium text-accent hover:underline">
                                დეტალურად
                            </Link>
                        </p>
                    </div>
                    {consent && (
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(false)}
                            aria-label="დახურვა"
                            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
                        >
                            <Icon icon="solar:close-circle-linear" className="h-5 w-5" />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => choose(true)}
                    className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover"
                >
                    ვეთანხმები
                </button>

                <div className="mt-2 flex justify-center">
                    <button
                        type="button"
                        onClick={() => choose(false)}
                        className="min-h-9 cursor-pointer rounded-lg px-3 text-xs text-text-secondary transition-colors hover:text-text-primary hover:underline"
                    >
                        მხოლოდ აუცილებელი
                    </button>
                </div>
            </div>
        </section>
    );
}
