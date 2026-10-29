"use client";

import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";
import CookieSettingsButton from "@/components/consent/CookieSettingsButton";
import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";

import {
    THEME_STORAGE_KEY,
    applyTheme,
    normalizeTheme,
    saveTheme,
    type ThemePreference,
} from "@/lib/theme/theme-preference";

// გვერდები, რომლებზეც ბმულები მიდის, მოგვიანებით შეიქმნება.
const columns = [
    {
        title: "პროდუქტი",
        links: [
            { label: "ფუნქციები", href: "/#features" },
            { label: "როგორ მუშაობს", href: "/#how-it-works" },
            { label: "ფასები", href: "/#pricing" },
            { label: "რეგისტრაცია", href: "/register" },
            { label: "შესვლა", href: "/login" },
        ],
    },
    {
        title: "დახმარება",
        links: [
            { label: "ხშირად დასმული კითხვები", href: "/faq" },
            { label: "კონტაქტი", href: "/contact" },
            { label: "ჩვენ შესახებ", href: "/about" },
        ],
    },
    {
        title: "იურიდიული",
        links: [
            { label: "კონფიდენციალურობის პოლიტიკა", href: "/privacy" },
            { label: "მომსახურების პირობები", href: "/terms" },
            { label: "უსაფრთხოება", href: "/security" },
            { label: "ქუქი-ფაილები", href: "/cookies" },
        ],
    },
];

const socialLinks = [
    { label: "Facebook", icon: "ri:facebook-fill", href: MARTEO_CONTACTS.facebook },
    { label: "Instagram", icon: "ri:instagram-line", href: MARTEO_CONTACTS.instagram },
    { label: "TikTok", icon: "ri:tiktok-fill", href: MARTEO_CONTACTS.tiktok },
    { label: "ელ-ფოსტა", icon: "ri:mail-line", href: `mailto:${MARTEO_CONTACTS.email}` },
];

const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: "light", label: "დღის", icon: "solar:sun-2-linear" },
    { value: "dark", label: "ღამის", icon: "solar:moon-linear" },
    { value: "system", label: "სისტემის", icon: "solar:monitor-linear" },
];

export default function Footer() {
    return (
        <footer className="border-t border-border bg-background">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <FooterCta />

                <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:py-16 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:gap-10">
                    <div className="col-span-2 md:col-span-1">
                        <Link href="/" aria-label="MARTEO — მთავარი" className="inline-block">
                            <Image
                                src="/images/marteo-11.svg"
                                alt=""
                                width={56}
                                height={56}
                                className="h-14 w-14 dark:hidden"
                            />
                            <Image
                                src="/images/marteo-12.svg"
                                alt=""
                                width={56}
                                height={56}
                                className="hidden h-14 w-14 dark:block"
                            />
                        </Link>

                        <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-secondary">
                            ბიზნესის მართვის პლატფორმა — შეკვეთები, მარაგი და
                            ფინანსები ერთ სივრცეში.
                        </p>

                        <ul className="mt-5 flex items-center gap-2">
                            {socialLinks.map(link => (
                                <li key={link.label}>
                                    <a
                                        href={link.href}
                                        aria-label={link.label}
                                        {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                                    >
                                        <Icon icon={link.icon} className="h-5 w-5" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {columns.map((column, index) => (
                        <nav
                            key={column.title}
                            aria-label={column.title}
                            className={index === columns.length - 1 ? "col-span-2 sm:col-span-1" : undefined}
                        >
                            <h2 className="text-sm font-semibold text-text-primary">{column.title}</h2>
                            <ul className="mt-4 space-y-3">
                                {column.links.map(link => (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            className="text-sm text-text-secondary transition-colors hover:text-accent"
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>

                <div className="flex flex-col-reverse items-center gap-4 border-t border-border py-6 text-center sm:flex-row sm:justify-between sm:text-left">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-5">
                        <p className="text-xs text-text-secondary">
                            © {new Date().getFullYear()} MARTEO. ყველა უფლება დაცულია.
                        </p>
                        <CookieSettingsButton className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-accent" />
                    </div>

                    <ThemeSwitch />
                </div>
            </div>
        </footer>
    );
}

function FooterCta() {
    return (
        <section
            aria-labelledby="footer-cta-title"
            className="landing-hero relative isolate mt-16 overflow-hidden rounded-3xl px-6 py-10 text-white sm:mt-24 sm:px-10 sm:py-12 lg:px-14"
        >
            <div aria-hidden="true" className="landing-hero-backdrop">
                <span className="landing-hero-glow landing-hero-glow-1" />
                <span className="landing-hero-glow landing-hero-glow-2" />
            </div>

            <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
                <h2
                    id="footer-cta-title"
                    className="max-w-xl text-2xl leading-tight font-bold text-balance sm:text-3xl"
                >
                    მზად ხარ, რომ ბიზნესი მარტივად მართო?
                </h2>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <Link
                        href="/register"
                        className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-accent/25 transition-all duration-200 hover:bg-accent-hover hover:scale-[1.02] sm:text-base"
                    >
                        სცადე უფასოდ
                        <Icon
                            icon="solar:arrow-right-linear"
                            className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold whitespace-nowrap text-white transition-colors duration-200 hover:border-white/40 hover:bg-white/10 sm:text-base"
                    >
                        შესვლა
                    </Link>
                </div>
            </div>
        </section>
    );
}

// რეჟიმი იკითხება <html data-theme>-დან და იცვლება სხვა ჩანართშიც (storage).
function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function onStorage(event: StorageEvent) {
        if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
        applyTheme(normalizeTheme(event.newValue));
    }

    window.addEventListener("storage", onStorage);

    return () => {
        observer.disconnect();
        window.removeEventListener("storage", onStorage);
    };
}

function readTheme() {
    return normalizeTheme(document.documentElement.getAttribute("data-theme"));
}

function ThemeSwitch() {
    const theme = useSyncExternalStore(subscribe, readTheme, () => null);

    function choose(next: ThemePreference) {
        applyTheme(next);
        saveTheme(next);
    }

    return (
        <div
            role="group"
            aria-label="საიტის ფერის რეჟიმი"
            className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
        >
            {themeOptions.map(option => {
                const selected = theme === option.value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => choose(option.value)}
                        className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
                            selected
                                ? "bg-accent/10 text-accent"
                                : "text-text-secondary hover:bg-background hover:text-text-primary"
                        }`}
                    >
                        <Icon icon={option.icon} className="h-4 w-4 shrink-0" />
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
