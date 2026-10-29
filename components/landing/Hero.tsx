"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@iconify/react";

import HeroDashboardPreview from "@/components/landing/HeroDashboardPreview";

// ტექსტები შაბლონურია — საბოლოო ქოფი მოგვიანებით ჩაჯდება.
const features = [
    {
        icon: "solar:hand-stars-bold-duotone",
        title: "მარტივი",
    },
    {
        icon: "solar:bolt-bold-duotone",
        title: "სწრაფი",
    },
    {
        icon: "solar:rocket-2-bold-duotone",
        title: "თანამედროვე",
    },
    {
        icon: "solar:shield-check-bold-duotone",
        title: "უსაფრთხო",
    },
];

export default function Hero() {
    const sectionRef = useRef<HTMLElement>(null);
    const stickyRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // ტელეფონზე და პლანშეტზე: ტექსტი ადგილზე რჩება, პანელი ქვემოდან ამოდის,
    // იზრდება და ტექსტს ეფარება. ზემოთ დაფიქსირების შემდეგ იგივე გვერდის
    // სქროლი პანელის შიგთავსს ამოძრავებს, ბოლოს კი გვერდი ჩვეულებრივ გრძელდება.
    useEffect(() => {
        const section = sectionRef.current;
        const sticky = stickyRef.current;
        const text = textRef.current;
        const viewport = section?.querySelector<HTMLElement>(".landing-preview-scroll");
        const content = viewport?.firstElementChild as HTMLElement | null | undefined;

        if (!section || !sticky || !text || !viewport || !content) return;

        const mobile = window.matchMedia("(max-width: 1023px)");
        const panelTop = 16;
        const startScale = 0.84;

        let start = 0;
        let rise = 0;
        let overflow = 0;
        let frame = 0;

        function update() {
            frame = 0;
            if (!mobile.matches || !section || !sticky) return;

            const offset = parseFloat(getComputedStyle(sticky).top) || 0;
            const scrolled = Math.min(
                Math.max(offset - section.getBoundingClientRect().top, 0),
                rise + overflow,
            );
            const progress = rise > 0 ? Math.min(scrolled / rise, 1) : 1;

            section.style.setProperty("--panel-y", `${start + (panelTop - start) * progress}px`);
            section.style.setProperty("--panel-scale", `${startScale + (1 - startScale) * progress}`);
            section.style.setProperty("--panel-inner-y", `${-Math.max(scrolled - rise, 0)}px`);
            section.style.setProperty("--hero-text-opacity", `${1 - progress * 0.6}`);
        }

        function requestUpdate() {
            if (!frame) frame = requestAnimationFrame(update);
        }

        function measure() {
            if (!section || !sticky || !text || !viewport || !content) return;

            if (!mobile.matches) {
                section.style.removeProperty("height");
                for (const name of ["--panel-y", "--panel-scale", "--panel-inner-y", "--hero-text-opacity"]) {
                    section.style.removeProperty(name);
                }
                return;
            }

            start = text.offsetTop + text.offsetHeight + 28;
            rise = Math.max(start - panelTop, 0);
            overflow = Math.max(content.offsetHeight - viewport.clientHeight, 0);
            section.style.height = `${sticky.offsetHeight + rise + overflow}px`;
            update();
        }

        const observer = new ResizeObserver(measure);
        observer.observe(sticky);
        observer.observe(text);
        observer.observe(content);

        mobile.addEventListener("change", measure);
        window.addEventListener("scroll", requestUpdate, { passive: true });
        measure();

        return () => {
            observer.disconnect();
            mobile.removeEventListener("change", measure);
            window.removeEventListener("scroll", requestUpdate);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <section
            ref={sectionRef}
            aria-labelledby="hero-title"
            className="landing-hero landing-hero-page relative isolate overflow-clip text-white lg:min-h-[calc(100svh-4rem)]"
        >
            <div
                ref={stickyRef}
                className="relative max-lg:sticky max-lg:top-16 max-lg:h-[calc(100svh-4rem)] max-lg:overflow-hidden lg:min-h-[calc(100svh-4rem)]"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                    <span className="landing-hero-glow landing-hero-glow-3" />
                </div>

                <div className="relative mx-auto w-full max-w-7xl px-4 pt-8 max-lg:h-full sm:px-6 sm:pt-12 lg:grid lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] lg:items-center lg:gap-10 lg:px-8 lg:py-12 lg:[@media(max-height:820px)]:py-8">
                    <div
                        ref={textRef}
                        className="landing-hero-enter landing-hero-text min-w-0"
                    >
                        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 sm:text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            ერთი სივრცე. სრული კონტროლი.
                        </p>

                        <h1
                            id="hero-title"
                            className="mt-5 text-[1.7rem] leading-tight font-bold sm:mt-6 sm:text-4xl lg:text-4xl xl:text-[2.5rem] 2xl:text-5xl 2xl:leading-tight lg:[@media(max-height:820px)]:mt-4 lg:[@media(max-height:820px)]:text-[2.1rem]"
                        >
                            ყველაფერი,
                            <span className="mt-1 block text-accent">
                                რაც შენი ბიზნესის მართვისთვის გჭირდება.
                            </span>
                        </h1>

                        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:mt-6 sm:text-lg lg:[@media(max-height:820px)]:mt-4 lg:[@media(max-height:820px)]:text-base">
                            მართე შეკვეთები, მარაგები, ფინანსები, ანალიტიკა და
                            კონტენტი — ერთ სივრცეში. შენ ბიზნესზე ფიქრობ,
                            დანარჩენს MARTEO აკეთებს.
                        </p>

                        <div className="mt-6 flex gap-3 sm:mt-8 lg:[@media(max-height:820px)]:mt-6">
                            <Link
                                href="/register"
                                className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-accent/25 transition-all duration-200 hover:bg-accent-hover hover:scale-[1.02] sm:flex-none sm:px-6 sm:text-base"
                            >
                                სცადე უფასოდ
                                <Icon
                                    icon="solar:arrow-right-linear"
                                    className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
                                />
                            </Link>

                            <a
                                href="#features"
                                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-3.5 text-sm font-semibold whitespace-nowrap text-white transition-colors duration-200 hover:border-white/40 hover:bg-white/10 sm:flex-none sm:px-6 sm:text-base"
                            >
                                გაიგე მეტი
                            </a>
                        </div>

                        <ul className="mt-6 flex justify-between gap-2 sm:mt-8 sm:grid sm:grid-cols-4 sm:gap-5 lg:mt-10 lg:[@media(max-height:820px)]:mt-7">
                            {features.map(feature => (
                                <HeroFeature key={feature.title} {...feature} />
                            ))}
                        </ul>
                    </div>

                    <div className="landing-hero-enter landing-hero-enter-delayed min-w-0 max-lg:absolute max-lg:inset-x-0 max-lg:top-0 max-lg:z-10 max-lg:h-[calc(100%-2rem)]">
                        <div className="landing-hero-panel max-lg:h-full">
                            <HeroDashboardPreview />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function HeroFeature({ icon, title }: { icon: string; title: string }) {
    return (
        <li className="flex min-w-0 flex-col items-center text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-accent sm:h-10 sm:w-10">
                <Icon icon={icon} className="h-5 w-5" />
            </span>

            <p className="mt-2 text-xs leading-snug text-slate-300 sm:mt-3 sm:text-sm">
                {title}
            </p>
        </li>
    );
}
