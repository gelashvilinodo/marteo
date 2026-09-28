"use client";

import type { ComponentProps, ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";

type Props = ComponentProps<typeof Link>;

function LinkContent({ children }: { children: ReactNode }) {
    const { pending } = useLinkStatus();

    return (
        <>
            <span
                aria-busy={pending}
                className="relative z-10 inline-flex items-center justify-center"
            >
                {children}
            </span>

            <svg
                viewBox="0 0 44 44"
                fill="none"
                aria-hidden="true"
                className={[
                    "pointer-events-none absolute inset-0 h-full w-full overflow-visible text-accent",
                    pending ? "opacity-100" : "opacity-0",
                ].join(" ")}
            >
                <rect
                    x="1"
                    y="1"
                    width="42"
                    height="42"
                    rx="11"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.2"
                />

                <rect
                    x="1"
                    y="1"
                    width="42"
                    height="42"
                    rx="11"
                    pathLength="100"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="22 78"
                    className={pending ? "pagination-border-trail" : ""}
                />
            </svg>

            <span role="status" className="sr-only">
                {pending ? "გვერდი იტვირთება" : ""}
            </span>
        </>
    );
}

export default function PaginationLink({
    children,
    className,
    ...props
}: Props) {
    return (
        <Link
            {...props}
            className={`relative isolate ${className ?? ""}`}
        >
            <LinkContent>{children}</LinkContent>
        </Link>
    );
}
