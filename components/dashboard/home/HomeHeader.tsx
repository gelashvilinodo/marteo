"use client";

import { useEffect, useState } from "react";

const greetings = {
    morning: {
        text: "დილა მშვიდობისა",
        tone: "text-warning bg-warning/10",
    },
    afternoon: {
        text: "დღე მშვიდობისა",
        tone: "text-accent bg-accent/10",
    },
    evening: {
        text: "საღამო მშვიდობისა",
        tone: "text-warning bg-warning/10",
    },
    night: {
        text: "ღამე მშვიდობისა",
        tone: "text-accent bg-accent/10",
    },
};

type Period = keyof typeof greetings;

function getPeriod(): Period {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";

    return "night";
}

function GreetingIcon({ period }: { period: Period | null }) {
    return (
        <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {period === "night" ? (
                <path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z" />
            ) : period === "evening" ? (
                <>
                    <path d="M19.5 12A7 7 0 0 1 12 3a7 7 0 0 0-6.8 9" />
                    <path d="M7 21h11a3 3 0 0 0 0-6h-.6a4.5 4.5 0 0 0-8.7-1.3A3.7 3.7 0 1 0 7 21Z" />
                </>
            ) : period === "morning" ? (
                <>
                    <path d="M3 17h18M5 21h14" />
                    <path d="M7 17a5 5 0 0 1 10 0" />
                    <path d="M3 12l2 1M19 13l2-1M6 7l1.5 2M16.5 9 18 7" />
                    <path d="M12 11V3m-3 3 3-3 3 3" />
                </>
            ) : (
                <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
                </>
            )}
        </svg>
    );
}

export default function HomeHeader({
    firstName,
}: {
    firstName: string | null;
}) {
    const name = firstName?.trim();
    const [period, setPeriod] = useState<Period | null>(null);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        function update() {
            if (timer) clearTimeout(timer);

            setPeriod(getPeriod());

            if (document.hidden) return;

            const now = new Date();
            const next = new Date(now);
            const hour = now.getHours();
            const boundary = [5, 12, 17, 21].find(value => value > hour);

            if (boundary === undefined) {
                next.setDate(next.getDate() + 1);
                next.setHours(5, 0, 0, 0);
            } else {
                next.setHours(boundary, 0, 0, 0);
            }

            timer = setTimeout(
                update,
                Math.max(1000, next.getTime() - now.getTime()),
            );
        }

        update();
        document.addEventListener("visibilitychange", update);

        return () => {
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);

    const greeting = period ? greetings[period] : null;

    return (
        <header className="min-w-0">
            <h1 className="text-2xl font-semibold text-text-primary">
                მთავარი
            </h1>

            <div className="mt-3 flex min-w-0 items-center gap-3">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${greeting?.tone ?? "text-accent bg-accent/10"
                        }`}
                >
                    <GreetingIcon period={period} />
                </span>

                <p className="min-w-0 break-words text-sm leading-relaxed text-text-secondary">
                    {greeting?.text ?? "გამარჯობა"}
                    {name ? (
                        <>
                            ,{" "}
                            <span className="font-semibold text-text-primary">
                                {name}
                            </span>
                        </>
                    ) : null}
                    !
                </p>
            </div>
        </header>
    );
}