"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import type {
    FinancialTrendPeriod,
    FinancialTrendPoint,
} from "@/lib/analytics/get-financial-trend";

function isPoint(value: unknown): value is FinancialTrendPoint {
    if (!value || typeof value !== "object") return false;

    const item = value as Record<string, unknown>;

    const isMoney = (amount: unknown) =>
        typeof amount === "string" &&
        /^-?\d+\.\d{2}$/.test(amount) &&
        Number.isFinite(Number(amount));

    return (
        typeof item.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        isMoney(item.sales) &&
        isMoney(item.costs) &&
        (item.profit === null || isMoney(item.profit))
    );
}

export function useFinancialTrend(
    initialPoints: FinancialTrendPoint[],
    initialPeriod: FinancialTrendPeriod = "week",
) {
    const [loaded, setLoaded] = useState({
        period: initialPeriod,
        points: initialPoints,
    });

    const [requestedPeriod, setRequestedPeriod] =
        useState<FinancialTrendPeriod>(initialPeriod);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const controller = useRef<AbortController | null>(null);
    const activePeriod = useRef<FinancialTrendPeriod>(initialPeriod);
    const loadedPeriod = useRef<FinancialTrendPeriod>(initialPeriod);
    const lastRequest = useRef<FinancialTrendPeriod>(initialPeriod);

    const loadPeriod = useCallback(
        async (value: FinancialTrendPeriod) => {
            controller.current?.abort();

            const request = new AbortController();
            controller.current = request;
            activePeriod.current = value;
            lastRequest.current = value;

            setRequestedPeriod(value);
            setLoading(true);
            setError("");

            try {
                const response = await fetch(
                    `/api/analytics/trend?period=${value}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                        signal: request.signal,
                    },
                );

                const raw: unknown = await response.json();

                const body =
                    raw && typeof raw === "object"
                        ? raw as Record<string, unknown>
                        : null;

                const points = body?.points;
                const expected =
                    value === "year"
                        ? 12
                        : value === "month"
                            ? 30
                            : 7;

                if (
                    !response.ok ||
                    body?.success !== true ||
                    body.period !== value ||
                    !Array.isArray(points) ||
                    !points.every(isPoint) ||
                    points.length !== expected
                ) {
                    throw new Error(
                        typeof body?.message === "string"
                            ? body.message
                            : "დიაგრამის მონაცემები ვერ ჩაიტვირთა.",
                    );
                }

                if (request.signal.aborted) return;

                loadedPeriod.current = value;
                setLoaded({ period: value, points });
            } catch (cause: unknown) {
                if (request.signal.aborted) return;

                activePeriod.current = loadedPeriod.current;
                setRequestedPeriod(loadedPeriod.current);

                setError(
                    cause instanceof Error
                        ? cause.message
                        : "დიაგრამა ვერ ჩაიტვირთა.",
                );
            } finally {
                if (
                    controller.current === request &&
                    !request.signal.aborted
                ) {
                    controller.current = null;
                    setLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        if (activePeriod.current === initialPeriod) {
            controller.current?.abort();
            controller.current = null;

            loadedPeriod.current = initialPeriod;
            setLoaded({
                period: initialPeriod,
                points: initialPoints,
            });

            setRequestedPeriod(initialPeriod);
            setLoading(false);
            setError("");
        } else {
            void loadPeriod(activePeriod.current);
        }
    }, [initialPoints, initialPeriod, loadPeriod]);

    useEffect(() => {
        return () => controller.current?.abort();
    }, []);

    return {
        ...loaded,
        requestedPeriod,
        loading,
        error,
        loadPeriod,
        reload: () => loadPeriod(lastRequest.current),
        profitReady: loaded.points.every(
            point => point.profit !== null,
        ),
    };
}
