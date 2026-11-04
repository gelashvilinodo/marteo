"use client";

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
    type Ref,
} from "react";

export default function CalendarTransition({
    position,
    bodyRef,
    dimmed = false,
    children,
}: {
    position: string;
    bodyRef?: Ref<HTMLDivElement>;
    dimmed?: boolean;
    children: ReactNode;
}) {
    const latestContent = useRef(children);

    const [transition, setTransition] = useState<{
        position: string;
        previous: ReactNode | null;
        direction: "next" | "previous";
    }>({
        position,
        previous: null,
        direction: "next",
    });

    if (transition.position !== position) {
        setTransition({
            position,
            previous: latestContent.current,
            direction:
                position < transition.position ? "previous" : "next",
        });
    }

    useLayoutEffect(() => {
        latestContent.current = children;
    });

    useEffect(() => {
        if (transition.previous === null) return;

        const timer = window.setTimeout(() => {
            setTransition(current =>
                current.position === position
                    ? { ...current, previous: null }
                    : current,
            );
        }, 450);

        return () => window.clearTimeout(timer);
    }, [position, transition.previous]);

    const animated = transition.previous !== null;

    return (
        <div
            ref={bodyRef}
            className={`relative min-h-0 flex-1 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none ${dimmed ? "opacity-60" : ""
                }`}
        >
            {animated && (
                <div
                    aria-hidden="true"
                    inert
                    className={`pointer-events-none absolute inset-0 flex min-h-0 flex-col ${
                        transition.direction === "next"
                            ? "calendar-body-exit-next"
                            : "calendar-body-exit-previous"
                    }`}
                >
                    {transition.previous}
                </div>
            )}

            {/* absolute: დაფას lg+-ზე მხოლოდ min-height აქვს, რის გამოც h-full არ იმუშავებდა.
                ტელეფონზე თვისა და კვირის დაფას სიმაღლე შიგთავსიდან მოდის, ამიტომ იქ static-ია. */}
            <div
                key={position}
                className={`absolute inset-0 flex min-h-0 flex-col max-sm:static max-sm:h-full ${
                    animated
                        ? transition.direction === "next"
                            ? "calendar-body-enter-next"
                            : "calendar-body-enter-previous"
                        : ""
                }`}
            >
                {children}
            </div>
        </div>
    );
}