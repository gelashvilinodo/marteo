import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata = {
    title: "ჩვენ შესახებ - MARTEO",
    description: "ვინ ვართ, რატომ შევქმენით მართეო და ვისთვის ვმუშაობთ.",
};

const values = [
    {
        title: "სიმარტივე",
        text: "ბიზნესის მართვას ტექნიკური ცოდნა არ უნდა სჭირდებოდეს. ყველა ფუნქციას ისე ვაწყობთ, რომ პირველივე დღიდან გასაგები იყოს.",
        icon: "solar:magic-stick-3-bold-duotone",
    },
    {
        title: "ხელმისაწვდომობა",
        text: "ვიცით, რამდენი ხარჯი აქვს ბიზნესს. ამიტომ მართეოს ფასს ისე ვგეგმავთ, რომ დამატებით ტვირთად არ იქცეს.",
        icon: "solar:wallet-money-bold-duotone",
    },
    {
        title: "ქართულ ბიზნესზე მორგებული",
        text: "მართეო ქართულ ბაზარზე და ადგილობრივი სელერების რეალურ საჭიროებებზეა აწყობილი - სრულად ქართულ ენაზე.",
        icon: "solar:map-point-wave-bold-duotone",
    },
    {
        title: "მუდმივი განვითარება",
        text: "მომხმარებლების მოსაზრებებს ვისმენთ და მართეოს მათთან ერთად ვავითარებთ - ყოველი განახლება რეალურ საჭიროებას პასუხობს.",
        icon: "solar:graph-up-bold-duotone",
    },
];

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="about-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">ჩვენ შესახებ</p>
                    <h1
                        id="about-title"
                        className="mx-auto mt-3 max-w-3xl text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        შევქმენით ის, რაც ჩვენ თავად გვაკლდა
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        მართეო ბიზნესის მართვის პლატფორმაა მწარმოებლებისა და სელერებისთვის - შექმნილი საქართველოში, 2026 წელს.
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-4xl space-y-14 px-4 py-12 sm:space-y-20 sm:px-6 sm:py-20 lg:px-8">
                <section aria-labelledby="about-story" className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
                    <div>
                        <p className="text-xs font-semibold tracking-wider text-accent uppercase">ჩვენი ისტორია</p>
                        <h2 id="about-story" className="mt-2 text-xl leading-snug font-bold text-text-primary sm:text-2xl">
                            როგორ დაიწყო
                        </h2>
                    </div>
                    <div className="space-y-4 text-[15px] leading-relaxed text-text-secondary sm:text-base">
                        <p>
                            მართეოს იდეა მაშინ გაჩნდა, როცა საკუთარი ბიზნესი წამოვიწყეთ. შეკვეთები, მარაგი, შესყიდვები და
                            ხარჯები სხვადასხვა ცხრილსა და ჩანაწერში იფანტებოდა, და ზუსტად ვერასდროს ვიცოდით, რამდენს
                            ვიმუშავებდით სინამდვილეში.
                        </p>
                        <p>
                            ვეძებდით პლატფორმას, რომელიც ამ ყველაფერს ერთ სივრცეში მოაქცევდა - ქართულად, ქართული ბიზნესის
                            საჭიროებებზე მორგებულს და ზედმეტი ხარჯის გარეშე. ასეთი ვერ ვიპოვეთ.
                        </p>
                        <p className="font-medium text-text-primary">ამიტომ გადავწყვიტეთ, თავად შეგვექმნა.</p>
                    </div>
                </section>

                <section
                    aria-label="ჩვენი მისია"
                    className="landing-hero relative isolate overflow-hidden rounded-3xl px-6 py-10 text-center text-white sm:px-12 sm:py-14"
                >
                    <div aria-hidden="true" className="landing-hero-backdrop">
                        <span className="landing-hero-glow landing-hero-glow-1" />
                        <span className="landing-hero-glow landing-hero-glow-2" />
                    </div>
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">ჩვენი მისია</p>
                    <p className="mx-auto mt-4 max-w-2xl text-xl leading-snug font-bold text-balance sm:text-3xl">
                        მწარმოებლებსა და სელერებს ვეხმარებით, ბიზნესი მარტივად მართონ - ზედმეტი ხარჯისა და დროის კარგვის გარეშე.
                    </p>
                </section>

                <section aria-labelledby="about-values">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase">რა გვამოძრავებს</p>
                    <h2 id="about-values" className="mt-2 text-xl font-bold text-text-primary sm:text-2xl">
                        ჩვენი ღირებულებები
                    </h2>

                    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                        {values.map(value => (
                            <li key={value.title} className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                    <Icon icon={value.icon} className="h-6 w-6" />
                                </span>
                                <h3 className="mt-4 font-semibold text-text-primary">{value.title}</h3>
                                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{value.text}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section aria-labelledby="about-for-whom" className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
                    <div>
                        <p className="text-xs font-semibold tracking-wider text-accent uppercase">ვისთვის</p>
                        <h2 id="about-for-whom" className="mt-2 text-xl leading-snug font-bold text-text-primary sm:text-2xl">
                            ვისთვის შევქმენით მართეო
                        </h2>
                    </div>
                    <blockquote className="border-l-4 border-accent pl-5 text-lg leading-relaxed font-medium text-text-primary sm:text-xl">
                        მართეო შეიქმნა მონდომებული ადამიანების მიერ - მათთვის, ვისაც გამოწვევების არ ეშინია, მუდმივად
                        სიახლეს ეძებს და საკუთარი შრომით სურს იმ წარმატების მიღწევა, რომელიც კარგი ცხოვრების საშუალებას მისცემს.
                    </blockquote>
                </section>

                <section aria-labelledby="about-team" className="rounded-3xl border border-border bg-surface p-6 sm:p-10">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <Icon icon="solar:users-group-two-rounded-bold-duotone" className="h-7 w-7" />
                    </span>
                    <h2 id="about-team" className="mt-4 text-xl font-bold text-text-primary sm:text-2xl">
                        ჩვენი გუნდი
                    </h2>
                    <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-text-secondary sm:text-base">
                        <p>
                            მართეოს მეგობრების გუნდი ქმნის, რომელიც ერთი მიზნით გაერთიანდა - ქართულ ბიზნესს მივცეთ
                            ისეთი ინსტრუმენტი, როგორიც ჩვენ თავად გვჭირდებოდა. თითოეულ ფუნქციას დიდი მონდომებით
                            ვქმნით და ვამოწმებთ.
                        </p>
                        <p>
                            მართეოსთან ერთად ჩვენი გუნდიც იზრდება. გვჯერა, რომ მომავალში არა მხოლოდ ბევრ ბიზნესს
                            დავეხმარებით, არამედ ბევრ ადამიანს ახალ სამუშაო ადგილსაც შევუქმნით.
                        </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link
                            href="/register"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                        >
                            სცადე მართეო
                            <Icon icon="solar:arrow-right-linear" className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/contact"
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
                        >
                            დაგვიკავშირდი
                        </Link>
                    </div>
                </section>
            </div>

            <Footer />
        </main>
    );
}
