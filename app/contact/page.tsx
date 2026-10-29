import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import CopyEmailButton from "@/components/landing/CopyEmailButton";
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";

export const metadata = {
    title: "კონტაქტი - MARTEO",
    description: "დაგვიკავშირდი ელფოსტით ან სოციალურ ქსელებში - Facebook, Instagram, TikTok.",
};

const socials = [
    { label: "Facebook", icon: "ri:facebook-fill", href: MARTEO_CONTACTS.facebook },
    { label: "Instagram", icon: "ri:instagram-line", href: MARTEO_CONTACTS.instagram },
    { label: "TikTok", icon: "ri:tiktok-fill", href: MARTEO_CONTACTS.tiktok },
];

const helpLinks = [
    {
        title: "უკვე მომხმარებელი ხარ?",
        text: "მართვის პანელში, „დახმარების“ განყოფილებიდან პირდაპირ მოგვწერე.",
        href: "/dashboard/help",
        icon: "solar:chat-round-dots-bold-duotone",
    },
    {
        title: "ხშირად დასმული კითხვები",
        text: "შესაძლოა, შენს კითხვაზე პასუხი უკვე იქ იყოს.",
        href: "/faq",
        icon: "solar:question-circle-bold-duotone",
    },
];

export default function ContactPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="contact-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">დახმარება</p>
                    <h1
                        id="contact-title"
                        className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        კონტაქტი
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        გაქვს კითხვა, იდეა ან შენიშვნა? მოგვწერე და სიამოვნებით გიპასუხებთ.
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 sm:space-y-14 sm:px-6 sm:py-16 lg:px-8">
                <section
                    aria-labelledby="contact-email-title"
                    className="rounded-2xl border border-border bg-surface p-5 sm:p-8"
                >
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon icon="solar:letter-bold-duotone" className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                            <h2 id="contact-email-title" className="text-lg font-semibold text-text-primary sm:text-xl">
                                ელფოსტა
                            </h2>
                            <p className="mt-1 text-sm text-text-secondary">
                                ნებისმიერ კითხვაზე, ანგარიშსა თუ გადახდასთან დაკავშირებით.
                            </p>
                            <a
                                href={`mailto:${MARTEO_CONTACTS.email}`}
                                className="mt-3 inline-block text-base font-semibold break-all text-accent hover:underline sm:text-lg"
                            >
                                {MARTEO_CONTACTS.email}
                            </a>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <a
                            href={`mailto:${MARTEO_CONTACTS.email}`}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:w-auto"
                        >
                            მოგვწერე
                            <Icon icon="solar:arrow-right-linear" className="h-4 w-4" />
                        </a>
                        <CopyEmailButton email={MARTEO_CONTACTS.email} />
                    </div>
                </section>

                <section aria-labelledby="contact-socials-title">
                    <h2 id="contact-socials-title" className="text-lg font-semibold text-text-primary sm:text-xl">
                        სოციალური ქსელები
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">გამოგვყევი სიახლეებისთვის ან მოგვწერე პირადში.</p>

                    <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                        {socials.map(social => (
                            <li key={social.label}>
                                <a
                                    href={social.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/40"
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                        <Icon icon={social.icon} className="h-6 w-6" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-text-primary">{social.label}</span>
                                        <span className="block truncate text-sm text-text-secondary">@marteo.ge</span>
                                    </span>
                                    <Icon
                                        icon="solar:arrow-right-up-linear"
                                        className="h-5 w-5 shrink-0 text-text-secondary transition-colors group-hover:text-accent"
                                    />
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>

                <ul className="grid gap-3 sm:grid-cols-2">
                    {helpLinks.map(link => (
                        <li key={link.href}>
                            <Link
                                href={link.href}
                                className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/40"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                    <Icon icon={link.icon} className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-text-primary group-hover:text-accent">{link.title}</span>
                                    <span className="mt-0.5 block text-sm leading-relaxed text-text-secondary">{link.text}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>

            <Footer />
        </main>
    );
}
