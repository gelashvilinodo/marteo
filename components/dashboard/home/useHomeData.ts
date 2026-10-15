"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import { ORDERS_CHANGED } from "@/lib/orders/refresh-orders-client";
import { PURCHASES_CHANGED } from "@/lib/purchases/refresh-purchases-client";
import { ANALYTICS_CHANGED } from "@/lib/analytics/refresh-analytics-client";

import type { HomeSummary } from "@/lib/dashboard/get-home-summary";
import type { HomeLists } from "@/lib/dashboard/get-home-lists";
import type { HomeTrend } from "@/lib/dashboard/get-home-trend";
import type {
    HomePatch,
    HomeRefreshSection,
} from "@/lib/dashboard/home-types";
import type { OrdersPeriod } from "@/lib/orders/orders-period";
import type { ExpenseBreakdownData } from "@/lib/analytics/get-expense-breakdown";

export type HomeData = {
    summary: HomeSummary;
    lists: HomeLists | null;
    trend: HomeTrend | null;
    expenses: ExpenseBreakdownData | null;
};

type Range = {
    period: OrdersPeriod;
    from: string;
    to: string;
};

function combine(
    sections: Set<HomeRefreshSection>,
): HomeRefreshSection {
    if (sections.has("all")) return "all";
    if (sections.has("orders")) return "orders";

    if (
        sections.has("stock") &&
        (sections.has("period") || sections.has("finance"))
    ) {
        return "orders";
    }

    if (sections.has("period")) return "period";
    if (sections.has("finance")) return "finance";

    return "stock";
}

export function useHomeData(initialData: HomeData) {
    const [data, setData] = useState(initialData);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    const current = useRef(initialData);
    const range = useRef<Range>({
        period: initialData.summary.period,
        from: initialData.summary.from,
        to: initialData.summary.to,
    });

    const alive = useRef(false);
    const revision = useRef(0);
    const queue = useRef(new Set<HomeRefreshSection>());
    const active = useRef<AbortController | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSection = useRef<HomeRefreshSection>("all");

    const flush = useCallback(async function flush(): Promise<void> {
        timer.current = null;

        if (!alive.current || active.current || queue.current.size === 0) {
            return;
        }

        const section = combine(queue.current);
        queue.current.clear();
        lastSection.current = section;

        const requestedRange = { ...range.current };
        const requestedRevision = revision.current;
        const controller = new AbortController();
        active.current = controller;

        setPending(true);
        setError("");

        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
            const params = new URLSearchParams({
                section,
                period: requestedRange.period,
                from: requestedRange.from,
                to: requestedRange.to,
            });

            const response = await fetch(
                `/api/dashboard/home?${params}`,
                {
                    cache: "no-store",
                    signal: controller.signal,
                },
            );

            const result = await response.json() as {
                success?: boolean;
                message?: string;
                data?: HomePatch;
            };

            if (!response.ok || !result.success || !result.data) {
                throw new Error(
                    result.message || "მონაცემები ვერ განახლდა.",
                );
            }

            if (!alive.current) return;

            if (requestedRevision !== revision.current) {
                queue.current.add(section);
                return;
            }

            const patch = result.data;
            const previous = current.current;

            const next: HomeData = {
                summary: {
                    ...previous.summary,
                    ...patch.summary,
                },
                lists: patch.orders !== undefined ||
                    patch.products !== undefined
                    ? {
                        orders: patch.orders ??
                            previous.lists?.orders ?? [],
                        products: patch.products ??
                            previous.lists?.products ?? [],
                    }
                    : previous.lists,
                trend: patch.trend ?? previous.trend,
                expenses: patch.expenses ?? previous.expenses,
            };

            current.current = next;
            setData(next);

            if (patch.summary.period !== undefined) {
                range.current = {
                    period: next.summary.period,
                    from: next.summary.from,
                    to: next.summary.to,
                };

                const params = new URLSearchParams({
                    period: next.summary.period,
                });

                if (next.summary.period === "custom") {
                    params.set("from", next.summary.from);
                    params.set("to", next.summary.to);
                }

                window.history.replaceState(
                    null,
                    "",
                    `/dashboard?${params}`,
                );
            }
        } catch (cause: unknown) {
            if (!alive.current) return;

            if (requestedRevision !== revision.current) {
                queue.current.add(section);
            } else {
                setError(
                    controller.signal.aborted
                        ? "განახლების დრო ამოიწურა. სცადე ხელახლა."
                        : cause instanceof Error
                            ? cause.message
                            : "მონაცემები ვერ განახლდა.",
                );
            }
        } finally {
            clearTimeout(timeout);

            if (active.current === controller) {
                active.current = null;
            }

            if (alive.current) {
                if (queue.current.size > 0) {
                    timer.current = setTimeout(() => void flush(), 100);
                } else {
                    setPending(false);
                }
            }
        }
    }, []);

    const refresh = useCallback((section: HomeRefreshSection) => {
        queue.current.add(
            current.current.summary.isNewBusiness ? "all" : section,
        );

        if (timer.current !== null) clearTimeout(timer.current);

        timer.current = setTimeout(() => void flush(), 100);
    }, [flush]);

    const changePeriod = useCallback((nextRange: Range) => {
        range.current = nextRange;
        revision.current += 1;
        active.current?.abort();
        refresh("period");
    }, [refresh]);

    useEffect(() => {
        alive.current = true;

        const ordersChanged = (event: Event) => {
            event.preventDefault();
            refresh("orders");
        };

        const purchasesChanged = (event: Event) => {
            event.preventDefault();
            refresh("stock");
        };

        const analyticsChanged = (event: Event) => {
            event.preventDefault();
            refresh("finance");
        };

        window.addEventListener(ORDERS_CHANGED, ordersChanged);
        window.addEventListener(PURCHASES_CHANGED, purchasesChanged);
        window.addEventListener(ANALYTICS_CHANGED, analyticsChanged);

        return () => {
            alive.current = false;
            active.current?.abort();

            if (timer.current !== null) {
                clearTimeout(timer.current);
            }

            window.removeEventListener(ORDERS_CHANGED, ordersChanged);
            window.removeEventListener(PURCHASES_CHANGED, purchasesChanged);
            window.removeEventListener(ANALYTICS_CHANGED, analyticsChanged);
        };
    }, [refresh]);

    return {
        data,
        pending,
        error,
        changePeriod,
        retry: () => refresh(lastSection.current),
    };
}