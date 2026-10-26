"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";

export default function AnimatedMaterialCard({
    label,
    onRemove,
    onRemoveStart,
    children,
}: {
    label: string;
    onRemove: () => void;
    onRemoveStart: () => void;
    children: ReactNode;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const animations = useRef<Animation[]>([]);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        const card = cardRef.current;

        if (
            !card ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }

        const animation = card.animate(
            [
                {
                    transform: "translateY(-60px) scale(0.92)",
                    opacity: 0,
                },
                {
                    transform: "translateY(0) scale(1)",
                    opacity: 1,
                },
            ],
            {
                duration: 650,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
        );

        animations.current.push(animation);

        return () => {
            animations.current.forEach((item) => item.cancel());
            animations.current = [];
        };
    }, []);

    function removeCard() {
        if (removing) return;

        const container = containerRef.current;
        const card = cardRef.current;

        if (!container || !card) return;

        if (
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            onRemoveStart();
            onRemove();
            return;
        }

        onRemoveStart();
        setRemoving(true);

        animations.current.forEach((item) => item.cancel());
        animations.current = [];

        const slide = card.animate(
            [
                {
                    transform: "translateX(0)",
                    opacity: 1,
                    borderColor: "#ef4444",
                },
                {
                    transform: "translateX(-105%)",
                    opacity: 0,
                    borderColor: "#ef4444",
                },
            ],
            {
                duration: 450,
                easing: "cubic-bezier(0.4, 0, 1, 1)",
                fill: "forwards",
            },
        );

        animations.current.push(slide);

        slide.onfinish = () => {
            const collapse = container.animate(
                [
                    {
                        height: `${container.getBoundingClientRect().height}px`,
                        marginBottom: "12px",
                    },
                    {
                        height: "0px",
                        marginBottom: "0px",
                    },
                ],
                {
                    duration: 250,
                    easing: "ease-in-out",
                    fill: "forwards",
                },
            );

            animations.current.push(collapse);
            collapse.onfinish = onRemove;
        };
    }

    return (
        <div
            ref={containerRef}
            className="mb-3 overflow-hidden"
        >
            <div
                ref={cardRef}
                className="purchase-product-card origin-top rounded-xl border border-border bg-background/50 p-3"
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-text-secondary">
                        {label}
                    </span>

                    <button
                        type="button"
                        disabled={removing}
                        aria-label={`${label} — წაშლა`}
                        onClick={removeCard}
                        className="delete-action flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition disabled:cursor-wait"
                    >
                        <Icon
                            icon="solar:trash-bin-trash-linear"
                            className="h-4 w-4"
                        />
                    </button>
                </div>

                <fieldset
                    disabled={removing}
                    className="min-w-0 border-0 p-0"
                >
                    {children}
                </fieldset>
            </div>
        </div>
    );
}

