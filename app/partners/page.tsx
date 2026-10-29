import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata = {
    title: "პარტნიორები - MARTEO",
    description: "კომპანიები, რომლებთანაც ერთად ვქმნით და ვავითარებთ მართეოს.",
};

const webmint = {
    url: "https://gelashvilinodo.github.io/webmint/",
    tags: ["ბრენდინგი", "ვებსაიტები", "ვებ-აპლიკაციები", "მხარდაჭერა"],
};

export default function PartnersPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="partners-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">პარტნიორები</p>
                    <h1
                        id="partners-title"
                        className="mx-auto mt-3 max-w-3xl text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        ერთად ვქმნით მართეოს
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        კომპანიები, რომლებიც მართეოს შექმნასა და განვითარებაში გვეხმარებიან.
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-5xl space-y-12 px-4 py-12 sm:space-y-16 sm:px-6 sm:py-20 lg:px-8">
                <article
                    aria-labelledby="partner-webmint"
                    className="grid overflow-hidden rounded-3xl border border-border bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
                >
                    {/* ლოგოს თეთრი სიტყვა აქვს, ამიტომ ფონი ორივე რეჟიმში მუქია - WebMint-ის ფერებით. */}
                    <div className="relative isolate flex min-h-52 items-center justify-center overflow-hidden bg-[#0b0f0e] px-8 py-12 sm:min-h-64">
                        <span
                            aria-hidden="true"
                            className="absolute -top-16 -left-10 -z-10 h-56 w-56 rounded-full bg-[#5FE3BC]/25 blur-3xl"
                        />
                        <span
                            aria-hidden="true"
                            className="absolute -right-12 -bottom-20 -z-10 h-60 w-60 rounded-full bg-[#d6409f]/25 blur-3xl"
                        />
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
                        />
                        <Image
                            src="/images/leaflogo.svg"
                            alt="WebMint"
                            width={2555}
                            height={702}
                            className="h-auto w-full max-w-64 drop-shadow-[0_0_24px_rgba(95,227,188,0.25)]"
                        />
                    </div>

                    <div className="flex flex-col p-6 sm:p-10">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                            <Icon icon="solar:code-square-bold-duotone" className="h-4 w-4" />
                            ტექნოლოგიური პარტნიორი
                        </span>
                        <h2 id="partner-webmint" className="mt-4 text-2xl font-bold text-text-primary sm:text-3xl">
                            WebMint
                        </h2>
                        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary sm:text-base">
                            ციფრული სტუდია, სადაც დიზაინი და კოდი ერთ გუნდშია. ქმნის ბრენდებს, საიტებს და ბიზნესზე
                            მორგებულ სისტემებს - იდეიდან გაშვებამდე.
                        </p>

                        <ul className="mt-5 flex flex-wrap gap-2">
                            {webmint.tags.map(tag => (
                                <li
                                    key={tag}
                                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-text-secondary"
                                >
                                    {tag}
                                </li>
                            ))}
                        </ul>

                        <p className="mt-6 border-l-2 border-accent pl-4 text-[15px] font-semibold text-text-primary">
                            მართეო WebMint-ის ნამუშევარია. შემდეგი შეიძლება შენი იდეა იყოს.
                        </p>

                        <a
                            href={webmint.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:w-fit"
                        >
                            ეწვიე WebMint-ს
                            <Icon icon="solar:arrow-right-up-linear" className="h-4 w-4" />
                        </a>
                    </div>
                </article>

                <section
                    aria-labelledby="partners-join"
                    className="rounded-3xl border border-dashed border-border p-6 text-center sm:p-10"
                >
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <Icon icon="solar:hand-shake-bold-duotone" className="h-7 w-7" />
                    </span>
                    <h2 id="partners-join" className="mt-4 text-xl font-bold text-text-primary sm:text-2xl">
                        გახდი ჩვენი პარტნიორი
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary sm:text-[15px]">
                        თუ გინდა, ერთად დავეხმაროთ ქართულ ბიზნესს ზრდაში, მოგვწერე.
                    </p>
                    <Link
                        href="/contact"
                        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
                    >
                        დაგვიკავშირდი
                    </Link>
                </section>
            </div>

            <Footer />
        </main>
    );
}
