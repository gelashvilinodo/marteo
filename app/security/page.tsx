import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";

export const metadata = {
    title: "უსაფრთხოება — MARTEO",
    description: "როგორ იცავს მართეო შენს ანგარიშსა და ბიზნესის მონაცემებს.",
};

// აქ მხოლოდ ის წერია, რაც მართეოში რეალურად მუშაობს — ახალი პუნქტი მხოლოდ ფუნქციის შემდეგ ემატება.
const protections = [
    {
        title: "დაშიფრული კავშირი",
        text: "საიტი მხოლოდ HTTPS-ით მუშაობს — ბრაუზერსა და სერვერს შორის ყველა მონაცემი დაშიფრულია.",
        icon: "solar:lock-keyhole-bold-duotone",
    },
    {
        title: "პაროლის დაცვა",
        text: "პაროლი ღია სახით არსად ინახება, მხოლოდ შეუქცევადად დაშიფრული. მისი ნახვა ჩვენც არ შეგვიძლია.",
        icon: "solar:key-bold-duotone",
    },
    {
        title: "ანგარიშის დადასტურება",
        text: "რეგისტრაციისას ელფოსტა და ტელეფონი კოდით დასტურდება, კოდის გამოსაცნობად კი მხოლოდ 5 ცდაა.",
        icon: "solar:verified-check-bold-duotone",
    },
    {
        title: "დაცვა პაროლის შერჩევისგან",
        text: "შესვლის, რეგისტრაციისა და პაროლის აღდგენის მცდელობები შეზღუდულია, ამიტომ ავტომატური პროგრამა პაროლს ვერ შეარჩევს.",
        icon: "solar:shield-warning-bold-duotone",
    },
    {
        title: "უსაფრთხო სესია",
        text: "შესვლა 30 დღეში იწურება. პაროლის შეცვლისას სხვა მოწყობილობებიდან ავტომატურად გამოხვალ.",
        icon: "solar:devices-bold-duotone",
    },
    {
        title: "წვდომის კონტროლი",
        text: "ბიზნესის მონაცემებს მხოლოდ მისი წევრები ხედავენ — ისიც მხოლოდ იმას, რაზეც მფლობელმა წვდომა მისცა.",
        icon: "solar:users-group-rounded-bold-duotone",
    },
    {
        title: "დაცვა მავნე კოდისგან",
        text: "უსაფრთხოების მკაცრი პოლიტიკა ბლოკავს უცხო სკრიპტებს, რომ საიტში მავნე კოდმა ვერ შემოაღწიოს.",
        icon: "solar:code-scan-bold-duotone",
    },
    {
        title: "სერვერები ევროპაში",
        text: "მონაცემები ევროპის დაცულ ღრუბლოვან ინფრასტრუქტურაზე ინახება, ასლი კი ყოველდღე კეთდება.",
        icon: "solar:server-square-bold-duotone",
    },
];

const commitments = [
    {
        title: "მონაცემებს არ ვყიდით და არ ვაზიარებთ",
        text: "შენი ბიზნესის მონაცემები — კლიენტები, შეკვეთები, ფასები, შემოსავალი — არ იყიდება და სარეკლამოდ მესამე მხარეს არ გადაეცემა.",
    },
    {
        title: "საკუთარი მიზნებისთვის არ ვიყენებთ",
        text: "შენს კლიენტებს ჩვენი რეკლამისთვის არ გამოვიყენებთ და შენს მონაცემებს სხვა ბიზნესებს არ ვადარებთ.",
    },
    {
        title: "შენი კლიენტების მონაცემები შენს კონტროლშია",
        text: "კლიენტების ტელეფონს და მისამართს მართეო მხოლოდ შენი დავალებით იყენებს — მაგალითად, შეკვეთის სტატუსის შეტყობინებისთვის. ჩვენი სახელით მათ არაფერს ვუგზავნით.",
    },
    {
        title: "გუნდის წვდომა შეზღუდულია",
        text: "მართეოს გუნდი შენს შეკვეთებს, კლიენტებსა და ფინანსებს არ ათვალიერებს. შიგნით მხოლოდ შენი თხოვნით შევიხედავთ — მაგალითად, ტექნიკური პრობლემის მოსაგვარებლად.",
    },
    {
        title: "წაშლისას ყველაფერი იშლება",
        text: "ანგარიშის წაშლისას ბიზნესის მონაცემები სამუდამოდ იშლება, სარეზერვო ასლებიდან კი — 7 დღეში.",
    },
];

const providers = [
    { name: "Supabase", purpose: "მონაცემთა ბაზა (ევროპა)" },
    { name: "Cloudflare", purpose: "ჰოსტინგი და დაცვა" },
    { name: "Resend", purpose: "ელფოსტის გაგზავნა" },
    { name: "sendsms.ge", purpose: "SMS-ის გაგზავნა" },
    { name: "Google Analytics", purpose: "საიტის სტატისტიკა — მხოლოდ თანხმობით, ბიზნესის მონაცემებს არ ხედავს" },
];

export default function SecurityPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="security-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">იურიდიული</p>
                    <h1
                        id="security-title"
                        className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        უსაფრთხოება
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        როგორ ვიცავთ შენს ანგარიშსა და ბიზნესის მონაცემებს.
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:space-y-16 sm:px-6 sm:py-16 lg:px-8">
                <section aria-labelledby="security-protections">
                    <h2 id="security-protections" className="text-lg font-semibold text-text-primary sm:text-xl">
                        როგორ ვიცავთ შენს ანგარიშს
                    </h2>

                    <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                        {protections.map(item => (
                            <li key={item.title} className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                    <Icon icon={item.icon} className="h-6 w-6" />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-text-primary">{item.title}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section
                    aria-labelledby="security-data"
                    className="rounded-3xl border border-border bg-surface p-5 sm:p-8"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon icon="solar:shield-user-bold-duotone" className="h-6 w-6" />
                        </span>
                        <h2 id="security-data" className="text-lg font-semibold text-text-primary sm:text-xl">
                            შენი მონაცემები — შენია
                        </h2>
                    </div>

                    <ul className="mt-6 space-y-5">
                        {commitments.map(item => (
                            <li key={item.title} className="flex items-start gap-3">
                                <Icon icon="solar:check-circle-bold" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-text-primary">{item.title}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section aria-labelledby="security-providers">
                    <h2 id="security-providers" className="text-lg font-semibold text-text-primary sm:text-xl">
                        ვინ გვეხმარება მომსახურების გაწევაში
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                        ეს სერვისები მონაცემებს მხოლოდ ჩვენი დავალებით და მართეოს მუშაობისთვის ამუშავებენ.
                    </p>

                    <dl className="mt-5 divide-y divide-border rounded-2xl border border-border bg-surface">
                        {providers.map(provider => (
                            <div key={provider.name} className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                                <dt className="font-semibold text-text-primary">{provider.name}</dt>
                                <dd className="text-sm leading-relaxed text-text-secondary">{provider.purpose}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section
                    aria-labelledby="security-report"
                    className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                >
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon icon="solar:bug-bold-duotone" className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 id="security-report" className="font-semibold text-text-primary">
                                უსაფრთხოების ხარვეზი შეამჩნიე?
                            </h2>
                            <p className="mt-0.5 text-sm text-text-secondary">მოგვწერე — ყველა შეტყობინებას სერიოზულად განვიხილავთ.</p>
                        </div>
                    </div>
                    <a
                        href={`mailto:${MARTEO_CONTACTS.email}?subject=${encodeURIComponent("უსაფრთხოების ხარვეზი")}`}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:w-auto"
                    >
                        შეგვატყობინე
                        <Icon icon="solar:arrow-right-linear" className="h-4 w-4" />
                    </a>
                </section>

                <p className="border-t border-border pt-6 text-sm text-text-secondary">
                    დეტალური პირობები —{" "}
                    <Link href="/privacy" className="font-medium text-accent hover:underline">
                        კონფიდენციალურობის პოლიტიკაში
                    </Link>
                    . ბოლო განახლება: 29 ოქტომბერი, 2026.
                </p>
            </div>

            <Footer />
        </main>
    );
}
