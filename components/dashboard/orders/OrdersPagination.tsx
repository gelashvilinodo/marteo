"use client";

import {
    useEffect,
    useRef,
    useState,
    useTransition,
    type ReactNode,
} from "react";
import { Icon } from "@iconify/react";

type Props = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

type ButtonProps = {
    children: ReactNode;
    label: string;
    active?: boolean;
    disabled?: boolean;
    loading?: boolean;
    pending: boolean;
    onClick: () => void;
};

function PageButton({
    children,
    label,
    active = false,
    disabled = false,
    loading = false,
    pending,
    onClick,
}: ButtonProps) {
    const appearance = disabled
        ? "inline-flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-surface text-text-secondary opacity-40"
        : active
            ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent bg-accent text-sm font-semibold tabular-nums text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium tabular-nums text-text-primary transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-current={active ? "page" : undefined}
            aria-busy={loading}
            disabled={disabled || pending}
            onClick={onClick}
            className={`relative isolate ${appearance}`}
        >
            <span className="relative z-10 inline-flex items-center justify-center">
                {children}
            </span>

            <svg
                viewBox="0 0 44 44"
                fill="none"
                aria-hidden="true"
                className={[
                    "pointer-events-none absolute inset-0 h-full w-full overflow-visible text-accent",
                    loading ? "opacity-100" : "opacity-0",
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
                    className={loading ? "pagination-border-trail" : ""}
                />
            </svg>

            <span role="status" className="sr-only">
                {loading ? "გვერდი იტვირთება" : ""}
            </span>
        </button>
    );
}

export default function OrdersPagination({
    currentPage,
    totalPages,
    onPageChange,
}: Props) {
    const [pending, startTransition] = useTransition();
    const [pendingButton, setPendingButton] = useState<string | null>(null);
    const previousPage = useRef(currentPage);

    useEffect(() => {
        if (previousPage.current === currentPage) return;

        previousPage.current = currentPage;

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        document.getElementById("orders-list")?.scrollIntoView({
            block: "start",
            behavior: reducedMotion ? "instant" : "smooth",
        });
    }, [currentPage]);

    function changePage(page: number, button: string) {
        if (
            pending ||
            page === currentPage ||
            page < 1 ||
            page > totalPages
        ) {
            return;
        }

        setPendingButton(button);

        startTransition(() => {
            onPageChange(page);
        });
    }

    if (totalPages <= 1) return null;

    const visiblePages =
        totalPages <= 7
            ? Array.from({ length: totalPages }, (_, index) => index + 1)
            : [...new Set([
                1,
                totalPages,
                ...Array.from(
                    { length: 5 },
                    (_, index) =>
                        Math.max(
                            2,
                            Math.min(currentPage - 2, totalPages - 5),
                        ) + index,
                ),
            ])].sort((first, second) => first - second);

    const items: Array<number | string> = [];

    for (const [index, page] of visiblePages.entries()) {
        const previous = visiblePages[index - 1];

        if (index > 0 && page - previous > 1) {
            items.push(`gap-${previous}-${page}`);
        }

        items.push(page);
    }

    return (
        <div className="border-t border-border p-3 sm:p-4">
            <nav
                aria-label="მარაგის გვერდები"
                className="flex min-w-0 items-center justify-center gap-2"
            >
                <PageButton
                    label="წინა გვერდი"
                    disabled={currentPage === 1}
                    pending={pending}
                    loading={pending && pendingButton === "previous"}
                    onClick={() => changePage(currentPage - 1, "previous")}
                >
                    <Icon
                        icon="solar:alt-arrow-left-linear"
                        aria-hidden="true"
                        className="h-5 w-5"
                    />
                </PageButton>

                <span
                    aria-label={`გვერდი ${currentPage}, სულ ${totalPages}`}
                    aria-live="polite"
                    className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 text-sm tabular-nums sm:hidden"
                >
                    <span className="font-semibold text-text-primary">
                        {currentPage}
                    </span>
                    <span className="text-text-secondary">
                        / {totalPages}
                    </span>
                </span>

                <div className="hidden items-center gap-1.5 sm:flex">
                    {items.map((item) =>
                        typeof item === "string" ? (
                            <span
                                key={item}
                                aria-hidden="true"
                                className="flex h-11 w-6 items-center justify-center text-text-secondary"
                            >
                                …
                            </span>
                        ) : (
                            <PageButton
                                key={item}
                                label={`გვერდი ${item}`}
                                active={item === currentPage}
                                pending={pending}
                                loading={
                                    pending &&
                                    pendingButton === `page-${item}`
                                }
                                onClick={() =>
                                    changePage(item, `page-${item}`)
                                }
                            >
                                {item}
                            </PageButton>
                        ),
                    )}
                </div>

                <PageButton
                    label="შემდეგი გვერდი"
                    disabled={currentPage === totalPages}
                    pending={pending}
                    loading={pending && pendingButton === "next"}
                    onClick={() => changePage(currentPage + 1, "next")}
                >
                    <Icon
                        icon="solar:alt-arrow-right-linear"
                        aria-hidden="true"
                        className="h-5 w-5"
                    />
                </PageButton>
            </nav>
        </div>
    );
}