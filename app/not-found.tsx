import Link from "next/link";
import { Icon } from "@/components/shared/Icon";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata = {
    title: "გვერდი ვერ მოიძებნა - MARTEO",
};

const links = [
    { label: "შესაძლებლობები", href: "/features" },
    { label: "ფასები", href: "/pricing" },
    { label: "ხშირად დასმული კითხვები", href: "/faq" },
    { label: "კონტაქტი", href: "/contact" },
];

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col bg-background">
            <Header />

            <section
                aria-labelledby="not-found-title"
                className="landing-hero landing-hero-page relative isolate flex-1 overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">შეცდომა 404</p>
                    <h1
                        id="not-found-title"
                        className="mx-auto mt-3 max-w-3xl text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        გვერდი ვერ მოიძებნა
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        შესაძლოა ბმული შეცდომით არის აკრეფილი ან გვერდი წაშლილია.
                    </p>

                    <Link
                        href="/"
                        className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                    >
                        <Icon icon="solar:home-2-bold-duotone" className="h-5 w-5" aria-hidden="true" />
                        მთავარზე დაბრუნება
                    </Link>

                    <nav aria-label="სასარგებლო ბმულები" className="mt-8 flex flex-wrap justify-center gap-2">
                        {links.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </section>

            <Footer />
        </main>
    );
}
