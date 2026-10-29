import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import FaqAccordion from "@/components/landing/FaqAccordion";
import { faqGroups } from "@/components/landing/faq-content";

export const metadata = {
    title: "ხშირად დასმული კითხვები - MARTEO",
    description: "პასუხები ყველაზე ხშირ კითხვებზე მართეოს, ფასების, უსაფრთხოებისა და მუშაობის შესახებ.",
};

export default function FaqPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="faq-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">დახმარება</p>
                    <h1
                        id="faq-title"
                        className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        ხშირად დასმული კითხვები
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        ყველაფერი, რაც მართეოს შესახებ რეგისტრაციამდე უნდა იცოდე.
                    </p>
                </div>
            </section>

            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:px-8">
                {/* თემების სწრაფი ნავიგაცია — დიდ ეკრანზე გვერდით ჩერდება, პატარაზე ზემოთ ჰორიზონტალურად იშლება. */}
                <nav aria-label="კითხვების თემები" className="lg:sticky lg:top-24 lg:self-start">
                    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 lg:flex-col lg:gap-1">
                        {faqGroups.map(group => (
                            <li key={group.id} className="shrink-0">
                                <a
                                    href={`#${group.id}`}
                                    className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium whitespace-nowrap text-text-secondary transition-colors hover:border-accent/40 hover:text-accent lg:h-11 lg:border-transparent lg:bg-transparent lg:hover:bg-accent/10"
                                >
                                    <Icon icon={group.icon} className="h-4 w-4 shrink-0 text-accent" />
                                    {group.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="mx-auto w-full max-w-3xl lg:mx-0">
                    <FaqAccordion groups={faqGroups} />

                    <div className="mt-14 flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <Icon icon="solar:chat-round-dots-bold-duotone" className="h-5 w-5" />
                            </span>
                            <div>
                                <p className="font-semibold text-text-primary">პასუხი ვერ იპოვე?</p>
                                <p className="mt-0.5 text-sm text-text-secondary">მოგვწერე და დაგეხმარებით.</p>
                            </div>
                        </div>
                        {/* m.me ბმული Facebook-ის გვერდის ნაცვლად პირდაპირ ჩატს ხსნის. */}
                        <a
                            href={MARTEO_CONTACTS.messengerChat}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:w-auto"
                        >
                            დაგვიკავშირდი
                            <Icon icon="solar:arrow-right-linear" className="h-4 w-4" />
                        </a>
                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}
