import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import CookieSettingsButton from "@/components/consent/CookieSettingsButton";

export const metadata = {
    title: "ქუქი-ფაილები — MARTEO",
    description: "რომელ ქუქი-ფაილებს იყენებს მართეო, რისთვის და როგორ შეცვალო შენი არჩევანი.",
};

const groups = [
    {
        title: "აუცილებელი",
        badge: "ყოველთვის ჩართულია",
        text: "ამის გარეშე საიტი ვერ იმუშავებს. თანხმობას არ საჭიროებს და მესამე მხარეს არ გადაეცემა.",
        icon: "solar:shield-check-bold-duotone",
        items: [
            { name: "marteo_session", purpose: "ანგარიშში შესვლის შენარჩუნება", duration: "30 დღე" },
            { name: "marteo-theme", purpose: "დღის/ღამის რეჟიმის დამახსოვრება", duration: "სანამ შეცვლი" },
            { name: "marteo-cookie-consent", purpose: "ქუქის შესახებ შენი არჩევანის დამახსოვრება", duration: "12 თვე" },
        ],
    },
    {
        title: "ანალიტიკური",
        badge: "მხოლოდ თანხმობით",
        text: "Google Analytics გვაჩვენებს, რამდენი ადამიანი სტუმრობს საიტს, რომელ გვერდებს ნახულობს და საიდან მოდის. ეს გვეხმარება, მართეო უკეთესი გავხადოთ. მონაცემები Google-ს გადაეცემა.",
        icon: "solar:chart-2-bold-duotone",
        items: [
            { name: "_ga", purpose: "სტუმრის გარჩევა ვიზიტებს შორის", duration: "2 წელი" },
            { name: "_ga_*", purpose: "ვიზიტის მონაცემების შენახვა", duration: "2 წელი" },
        ],
    },
];

export default function CookiesPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="cookies-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">იურიდიული</p>
                    <h1
                        id="cookies-title"
                        className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        ქუქი-ფაილები
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        მარტივად — რას ვინახავთ შენს ბრაუზერში, რისთვის და როგორ შეცვალო არჩევანი.
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:space-y-14 sm:px-6 sm:py-16 lg:px-8">
                <section aria-labelledby="cookies-what" className="space-y-3 text-sm leading-relaxed text-text-secondary sm:text-[15px]">
                    <h2 id="cookies-what" className="text-lg font-semibold text-text-primary sm:text-xl">
                        რა არის ქუქი-ფაილი?
                    </h2>
                    <p>
                        ქუქი-ფაილი პატარა ჩანაწერია, რომელსაც საიტი შენს ბრაუზერში ინახავს, რომ შენი არჩევანი ან
                        შესვლა დაიმახსოვროს. ზოგი მათგანი საიტის მუშაობისთვის აუცილებელია, ზოგი კი — მხოლოდ
                        სტატისტიკისთვის.
                    </p>
                    <p>
                        მართეო სარეკლამო ქუქი-ფაილებს არ იყენებს და შენს მონაცემებს არ ყიდის.
                    </p>
                </section>

                <section aria-labelledby="cookies-list" className="space-y-5">
                    <h2 id="cookies-list" className="text-lg font-semibold text-text-primary sm:text-xl">
                        რომელ ქუქი-ფაილებს ვიყენებთ
                    </h2>

                    {groups.map(group => (
                        <div key={group.title} className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                    <Icon icon={group.icon} className="h-5 w-5" />
                                </span>
                                <h3 className="font-semibold text-text-primary">{group.title}</h3>
                                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                                    {group.badge}
                                </span>
                            </div>
                            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{group.text}</p>

                            <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
                                {group.items.map(item => (
                                    <div key={item.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                                        <dt className="font-mono text-xs break-all text-text-primary">{item.name}</dt>
                                        <dd className="text-sm text-text-secondary">{item.purpose}</dd>
                                        <dd className="text-xs text-text-secondary sm:text-right">{item.duration}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ))}
                </section>

                <section aria-labelledby="cookies-change" className="space-y-3 text-sm leading-relaxed text-text-secondary sm:text-[15px]">
                    <h2 id="cookies-change" className="text-lg font-semibold text-text-primary sm:text-xl">
                        როგორ შევცვალო არჩევანი?
                    </h2>
                    <p>
                        შენი არჩევანი 12 თვე ინახება. მისი შეცვლა ნებისმიერ დროს შეგიძლია — ამ ღილაკით ან საიტის
                        ბოლოში „ქუქის პარამეტრებიდან“. თანხმობის გაუქმებისას ანალიტიკური ქუქი-ფაილები იშლება.
                    </p>
                    <CookieSettingsButton className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent" />
                    <p>
                        ქუქი-ფაილების წაშლა ან დაბლოკვა ბრაუზერის პარამეტრებშიც შეგიძლია. გაითვალისწინე, რომ
                        აუცილებელი ქუქი-ფაილების გარეშე ანგარიშში შესვლა ვერ მოხერხდება.
                    </p>
                </section>

                <p className="border-t border-border pt-6 text-sm text-text-secondary">
                    კითხვები გაქვს?{" "}
                    <Link href="/contact" className="font-medium text-accent hover:underline">
                        დაგვიკავშირდი
                    </Link>
                    . ბოლო განახლება: 29 ოქტომბერი, 2026.
                </p>
            </div>

            <Footer />
        </main>
    );
}
