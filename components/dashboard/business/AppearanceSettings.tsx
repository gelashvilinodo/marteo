"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "marteo-theme";

const options: {
    value: Theme;
    label: string;
    icon: string;
}[] = [
    {
        value: "light",
        label: "დღის",
        icon: "solar:sun-2-linear",
    },
    {
        value: "dark",
        label: "ღამის",
        icon: "solar:moon-linear",
    },
    {
        value: "system",
        label: "სისტემის",
        icon: "solar:monitor-linear",
    },
];

function normalizeTheme(value: string | null): Theme {
    return value === "light" || value === "dark"
        ? value
        : "system";
}

function applyTheme(theme: Theme) {
    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", theme);
    }
}

export default function AppearanceSettings() {
    const [theme, setTheme] = useState<Theme>("system");
    const [ready, setReady] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        // Read the theme already applied before the page appeared.
        setTheme(
            normalizeTheme(
                document.documentElement.getAttribute("data-theme"),
            ),
        );
        setReady(true);

        function onStorage(event: StorageEvent) {
            if (
                event.key !== STORAGE_KEY &&
                event.key !== null
            ) {
                return;
            }

            const next = normalizeTheme(event.newValue);

            applyTheme(next);
            setTheme(next);
            setMessage("");
        }

        window.addEventListener("storage", onStorage);

        return () => {
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    function chooseTheme(next: Theme) {
        applyTheme(next);
        setTheme(next);

        try {
            if (next === "system") {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                localStorage.setItem(STORAGE_KEY, next);
            }

            setMessage("არჩევანი შენახულია.");
        } catch {
            setMessage(
                "რეჟიმი შეიცვალა, მაგრამ ბრაუზერმა არჩევანის დამახსოვრება ვერ შეძლო.",
            );
        }
    }

    return (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                <Icon
                    icon="solar:palette-linear"
                    className="size-5 text-accent"
                    aria-hidden="true"
                />
                გარეგნობა
            </h2>

            <p className="mt-2 text-sm text-text-secondary">
                აირჩიე სასურველი რეჟიმი. „სისტემის“ არჩევისას
                საიტი მოწყობილობის რეჟიმს მიჰყვება.
            </p>

            <div
                role="group"
                aria-label="საიტის ფერის რეჟიმი"
                className="mt-4 grid max-w-md grid-cols-3 gap-2"
            >
                {options.map(option => {
                    const selected =
                        ready && theme === option.value;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            disabled={!ready}
                            aria-pressed={selected}
                            onClick={() =>
                                chooseTheme(option.value)
                            }
                            className={[
                                "flex min-h-11 min-w-0 items-center",
                                "justify-center gap-2 rounded-xl border",
                                "px-2 py-2 text-sm transition-colors",
                                "focus-visible:outline-2",
                                "focus-visible:outline-offset-2",
                                "focus-visible:outline-accent",
                                "disabled:opacity-50",
                                selected
                                    ? "border-accent bg-accent/10 text-accent"
                                    : "border-border text-text-secondary hover:bg-background hover:text-text-primary",
                            ].join(" ")}
                        >
                            <Icon
                                icon={option.icon}
                                className="size-5 shrink-0"
                                aria-hidden="true"
                            />
                            {option.label}
                        </button>
                    );
                })}
            </div>

            <p className="mt-3 text-xs text-text-secondary">
                არჩევანი ამ ბრაუზერში ინახება.
            </p>

            <p
                role="status"
                className="mt-2 text-xs text-text-secondary"
            >
                {message}
            </p>
        </section>
    );
}