import type { ReactNode } from "react";
import Link from "next/link";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";

export type LegalSection = { id: string; title: string; body: ReactNode[] };

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link href={href} className="font-medium text-accent hover:underline">
            {children}
        </Link>
    );
}

type LegalDocumentProps = {
    titleId: string;
    title: string;
    subtitle: string;
    sections: LegalSection[];
};

export default function LegalDocument({ titleId, title, subtitle, sections }: LegalDocumentProps) {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby={titleId}
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">იურიდიული</p>
                    <h1
                        id={titleId}
                        className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        {title}
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">{subtitle}</p>
                </div>
            </section>

            <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                <nav aria-label="სარჩევი" className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                    <p className="text-sm font-semibold text-text-primary">სარჩევი</p>
                    <ol className="mt-2 grid gap-x-6 text-sm sm:mt-3 sm:grid-cols-2 sm:gap-y-2">
                        {sections.map((section, index) => (
                            <li key={section.id}>
                                <a href={`#${section.id}`} className="inline-flex min-h-11 items-center text-text-secondary transition-colors hover:text-accent sm:min-h-0">
                                    {index + 1}. {section.title}
                                </a>
                            </li>
                        ))}
                    </ol>
                </nav>

                <div className="mt-12 space-y-10 sm:space-y-12">
                    {sections.map((section, index) => (
                        <section
                            key={section.id}
                            id={section.id}
                            aria-labelledby={`${section.id}-title`}
                            className="scroll-mt-24 space-y-3 text-sm leading-relaxed text-text-secondary sm:text-[15px]"
                        >
                            <h2 id={`${section.id}-title`} className="text-lg font-semibold text-text-primary sm:text-xl">
                                {index + 1}. {section.title}
                            </h2>
                            {section.body.map((paragraph, paragraphIndex) => (
                                <p key={paragraphIndex}>{paragraph}</p>
                            ))}
                        </section>
                    ))}
                </div>

                <p className="mt-12 border-t border-border pt-6 text-sm text-text-secondary">
                    კითხვები გაქვთ? მოგვწერეთ{" "}
                    <a href={`mailto:${MARTEO_CONTACTS.email}`} className="font-medium text-accent hover:underline">
                        {MARTEO_CONTACTS.email}
                    </a>{" "}
                    ან <LegalLink href="/contact">დაგვიკავშირდით</LegalLink>. ძალაშია: 2026 წლის 15 ნოემბრიდან.
                </p>
            </div>

            <Footer />
        </main>
    );
}
