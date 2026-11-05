"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";

// „ერთი შეკვეთის გზა": ბლოკი ეკრანზე რომ გამოჩნდება, ეტაპები რიგრიგობით
// ინთება. ციფრები იგივეა, რაც შესაძლებლობების სცენებში (საფულე 5 → 4,
// გაყიდვა 65 ₾, მოგება +37 ₾), SMS-ის ტექსტი კი lib/sms/order-sms.ts-დანაა.
// შემცირებული მოძრაობისას ყველა ეტაპი მაშინვე ანთებულია.

const STEP_MS = 900;

const stages = [
    { icon: "solar:add-circle-bold-duotone", title: "შეკვეთა დაემატა", detail: "ნინო ბერიძე · 65 ₾" },
    { icon: "solar:box-bold-duotone", title: "მარაგი შემცირდა", detail: "ტყავის საფულე 5 → 4" },
    { icon: "solar:delivery-bold-duotone", title: "გაიგზავნა", detail: "სტატუსი: გაგზავნილი" },
    { icon: "solar:chat-round-dots-bold-duotone", title: "მომხმარებელს SMS", detail: "„კურიერს გადაეცა, მალე მიიღებთ“" },
    { icon: "solar:wallet-money-bold-duotone", title: "მოგება დაითვალა", detail: "+37 ₾ სუფთა მოგება" },
];

export default function OrderJourney() {
    const [lit, setLit] = useState(0);
    const sectionRef = useRef<HTMLElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const play = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setLit(stages.length);
            return;
        }
        setLit(0);
        stages.forEach((_, index) => timers.current.push(setTimeout(() => setLit(index + 1), 300 + index * STEP_MS)));
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const pending = timers.current;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            play();
        }, { threshold: 0.3 });
        observer.observe(section);

        return () => {
            observer.disconnect();
            pending.forEach(clearTimeout);
        };
    }, [play]);

    const done = lit === stages.length;

    return (
        <section ref={sectionRef} aria-labelledby="order-journey-title" className="border-y border-border bg-surface">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                <div className="text-center">
                    <p className="text-sm font-semibold text-accent">ერთი შეკვეთის გზა</p>
                    <h2 id="order-journey-title" className="mt-2 text-[clamp(1.35rem,4vw,2rem)] leading-tight font-bold text-balance text-text-primary">
                        ნახეთ, როგორ მოძრაობს შეკვეთა MARTEO-ში
                    </h2>
                </div>

                <ol className="relative mt-10 grid gap-3 lg:grid-cols-5 lg:gap-4">
                    {/* დესკტოპზე ეტაპებს ერთი ხაზი აერთებს და ის ანთებულ ეტაპამდე ივსება. */}
                    <span aria-hidden="true" className="absolute top-7 right-[10%] left-[10%] hidden h-0.5 bg-border lg:block">
                        <span
                            className="block h-full bg-accent transition-[width] duration-700 ease-out"
                            style={{ width: `${Math.max(0, lit - 1) / (stages.length - 1) * 100}%` }}
                        />
                    </span>

                    {stages.map((stage, index) => {
                        const on = index < lit;

                        return (
                            <li
                                key={stage.title}
                                className={`relative flex items-center gap-4 rounded-2xl border bg-background p-4 transition-[border-color,opacity] duration-500 lg:flex-col lg:border-0 lg:bg-transparent lg:p-0 lg:text-center ${
                                    on ? "border-accent/40 opacity-100" : "border-border opacity-50"
                                }`}
                            >
                                <span
                                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-500 ${
                                        on ? "border-accent bg-accent text-white" : "border-border bg-background text-text-secondary"
                                    }`}
                                >
                                    <Icon icon={stage.icon} className="h-7 w-7" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold text-text-primary">{stage.title}</p>
                                    <p className="mt-0.5 text-sm text-text-secondary">{stage.detail}</p>
                                </div>
                            </li>
                        );
                    })}
                </ol>

                <div className="mt-8 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={play}
                        tabIndex={done ? undefined : -1}
                        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-text-primary transition-[colors,opacity] hover:border-accent/50 hover:text-accent ${
                            done ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    >
                        <Icon icon="solar:restart-bold" className="h-4 w-4 text-accent" aria-hidden="true" />
                        კიდევ ერთხელ ნახვა
                    </button>
                    <p className="text-xs text-text-secondary">SMS ბიზნეს და PRO პაკეტშია.</p>
                </div>
            </div>
        </section>
    );
}
