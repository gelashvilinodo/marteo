"use client";

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

export default function CalendarTransition({
    position,
    children,
}: {
    position: string;
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
        <div className="relative min-h-0 flex-1 overflow-hidden">
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

            <div
                key={position}
                className={`flex h-full min-h-0 flex-col ${
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