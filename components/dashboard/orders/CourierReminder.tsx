"use client";
import useTransientNotice from '@/components/shared/useTransientNotice';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { Icon } from "@iconify/react";
import CourierReminderSkeleton from "./CourierReminderSkeleton";
import type {
    CourierReminder as Reminder,
} from "@/lib/orders/get-courier-reminder";
import {
    ORDERS_CHANGED,
} from "@/lib/orders/refresh-orders-client";

export const COURIER_REMINDER_CHANGED =
    "marteo:courier-reminder-changed";

type PendingRequest = {
    path: string;
    body: Record<string, unknown>;
};

type ApiResponse = {
    success?: boolean;
    message?: string;
    reminder?: Reminder;
    canManage?: boolean;
};

function money(value: string) {
    return `${value.replace(".", ",")} ₾`;
}

function today() {
    return new Date(
        Date.now() + 4 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);
}

export default function CourierReminder() {
    const [reminder, setReminder] = useState<Reminder | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [startDate, setStartDate] = useState(today);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    useTransientNotice(notice, setNotice);

    const mounted = useRef(false);
    const running = useRef(false);
    const uncertain = useRef(false);
    const pending = useRef<PendingRequest | null>(null);
    const readController = useRef<AbortController | null>(null);
    const writeController = useRef<AbortController | null>(null);
    const lastRead = useRef(0);

    const load = useCallback(async () => {
        if (running.current || pending.current) return;

        readController.current?.abort();

        const controller = new AbortController();
        readController.current = controller;

        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                "/api/orders/courier-reminder",
                {
                    cache: "no-store",
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            const body = await response.json() as ApiResponse;

            if (
                !response.ok ||
                body.success !== true ||
                !body.reminder ||
                typeof body.canManage !== "boolean"
            ) {
                throw new Error(
                    body.message ||
                    "საკურიეროს მონაცემები ვერ ჩაიტვირთა.",
                );
            }

            if (!mounted.current || controller.signal.aborted) return;

            setReminder(body.reminder);
            setCanManage(body.canManage);
            lastRead.current = Date.now();
        } catch (cause: unknown) {
            if (!mounted.current || controller.signal.aborted) return;

            setError(
                cause instanceof Error
                    ? cause.message
                    : "მონაცემები ვერ ჩაიტვირთა.",
            );
        } finally {
            if (
                mounted.current &&
                !controller.signal.aborted
            ) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        let active = true;
        let queued: ReturnType<typeof setTimeout> | null = null;

        function schedule(force: boolean) {
            if (
                document.visibilityState !== "visible" ||
                running.current ||
                pending.current
            ) return;

            if (
                !force &&
                Date.now() - lastRead.current < 30_000
            ) return;

            if (queued) clearTimeout(queued);

            queued = setTimeout(() => {
                queued = null;
                if (active) void load();
            }, 100);
        }

        function changed() {
            schedule(true);
        }

        function focused() {
            schedule(false);
        }

        queueMicrotask(() => {
            if (active) void load();
        });

        window.addEventListener(ORDERS_CHANGED, changed);
        window.addEventListener(COURIER_REMINDER_CHANGED, changed);
        window.addEventListener("focus", focused);
        document.addEventListener("visibilitychange", focused);

        return () => {
            active = false;
            mounted.current = false;

            if (queued) clearTimeout(queued);

            readController.current?.abort();
            writeController.current?.abort();

            window.removeEventListener(ORDERS_CHANGED, changed);
            window.removeEventListener(
                COURIER_REMINDER_CHANGED,
                changed,
            );
            window.removeEventListener("focus", focused);
            document.removeEventListener(
                "visibilitychange",
                focused,
            );
        };
    }, [load]);

    async function save(kind: "START" | "SETTLE") {
        if (running.current) return;

        if (!pending.current) {
            if (!canManage || !reminder || loading || error) return;

            if (kind === "START") {
                if (!startDate || reminder.enabled) return;

                pending.current = {
                    path: "/api/orders/courier-reminder/start",
                    body: { startDate },
                };
            } else {
                if (!reminder.canSettle) return;

                pending.current = {
                    path: "/api/orders/courier-reminder",
                    body: {
                        clientRequestId: crypto.randomUUID(),
                        confirmed: true,
                        expectedReminder: reminder,
                    },
                };
            }
        }

        const request = pending.current;
        const controller = new AbortController();
        writeController.current = controller;

        running.current = true;
        readController.current?.abort();

        setLoading(false);
        setSaving(true);
        setError("");
        setNotice("");

        let refreshAfterFailure = false;

        try {
            const response = await fetch(request.path, {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request.body),
                signal: controller.signal,
            });

            const body = await response.json() as ApiResponse;

            if (!response.ok || body.success !== true) {
                const definitiveFailure =
                    !uncertain.current &&
                    response.status >= 400 &&
                    response.status < 500;

                if (definitiveFailure) {
                    pending.current = null;
                    refreshAfterFailure = true;
                }

                throw new Error(
                    body.message ||
                    "შენახვის შედეგი ვერ დადასტურდა.",
                );
            }

            if (!body.reminder) {
                throw new Error(
                    "შენახვის პასუხი ვერ დადასტურდა.",
                );
            }

            if (!mounted.current) return;

            pending.current = null;
            uncertain.current = false;
            setRetrying(false);
            setReminder(body.reminder);
            lastRead.current = Date.now();

            setNotice(
                request.path.endsWith("/start")
                    ? "საკურიეროს შეხსენება ჩართულია."
                    : "საკურიეროსთან გასწორება შენახულია.",
            );
        } catch (cause: unknown) {
            if (!mounted.current) return;

            uncertain.current = pending.current !== null;
            setRetrying(uncertain.current);

            const message = cause instanceof Error
                ? cause.message
                : "შენახვის შედეგი ვერ დადასტურდა.";

            if (refreshAfterFailure) {
                setNotice(message);
            } else {
                setError(message);
            }
        } finally {
            running.current = false;

            if (mounted.current) {
                setSaving(false);

                if (refreshAfterFailure) {
                    await load();
                }
            }
        }
    }

    const balance = reminder?.balance;
    const receiving = balance?.direction === "RECEIVE";
    const settled = balance?.direction === "SETTLED";

    if (!reminder && loading) {
        return <CourierReminderSkeleton />;
    }

    return (
        <section
            aria-busy={loading || saving}
            className="mt-4 rounded-2xl border border-border bg-surface p-4"
        >
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon
                        icon="solar:delivery-linear"
                        className="size-6"
                        aria-hidden="true"
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold text-text-primary">
                            საკურიეროსთან გასასწორებელი
                        </h2>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading || saving || retrying}
                            aria-label="საკურიეროს მონაცემების განახლება"
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs disabled:opacity-50"
                        >
                            <Icon
                                icon="solar:refresh-linear"
                                className={`size-4 ${loading ? "animate-spin" : ""}`}
                                aria-hidden="true"
                            />
                            განახლება
                        </button>
                    </div>

                    {!reminder && loading && (
                        <p role="status" className="mt-2 text-sm text-text-secondary">
                            მონაცემები იტვირთება…
                        </p>
                    )}

                    {reminder && !reminder.enabled && (
                        <div className="mt-3 space-y-3">
                            <p className="text-sm text-text-secondary">
                                აირჩიე, რომელი დღიდან შექმნილი შეკვეთებისთვის
                                დაითვალოს საკურიეროსთან გასასწორებელი თანხა.
                                უფრო ძველი შეკვეთები არ ჩაითვლება.
                            </p>

                            {canManage ? (
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="space-y-1 text-sm">
                                        <span className="block">
                                            დაწყების თარიღი
                                        </span>
                                        <input
                                            type="date"
                                            value={startDate}
                                            max={today()}
                                            onChange={event =>
                                                setStartDate(event.target.value)
                                            }
                                            disabled={saving || retrying}
                                            className="min-h-11 rounded-xl border border-border bg-background px-3"
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => void save("START")}
                                        disabled={
                                            loading ||
                                            saving ||
                                            retrying ||
                                            !startDate ||
                                            Boolean(error)
                                        }
                                        className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        {saving ? "ირთვება…" : "შეხსენების ჩართვა"}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-sm text-text-secondary">
                                    შეხსენების ჩართვა შეუძლია ბიზნესის
                                    მფლობელს ან ადმინისტრატორს.
                                </p>
                            )}
                        </div>
                    )}

                    {reminder?.enabled && balance && (
                        <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm text-text-secondary">
                                        {settled
                                            ? "საკურიეროსთან თანხა გასწორებულია"
                                            : receiving
                                                ? "საკურიეროსგან მისაღებია"
                                                : "საკურიეროსთვის გადასარიცხია"}
                                    </p>
                                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${settled ? "text-success" : receiving ? "text-accent" : "text-warning"}`}>
                                        {money(balance.amount)}
                                    </p>
                                </div>

                                {canManage && reminder.canSettle && !retrying && (
                                    <button
                                        type="button"
                                        onClick={() => void save("SETTLE")}
                                        disabled={loading || saving || Boolean(error)}
                                        className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        {saving
                                            ? "ინახება…"
                                            : receiving
                                                ? "მივიღე"
                                                : "გადავურიცხე"}
                                    </button>
                                )}
                            </div>

                            {reminder.unresolvedOrderCount > 0 && (
                                <p role="alert" className="text-sm text-warning">
                                    {reminder.unresolvedOrderCount} შეკვეთაზე
                                    გადახდის მონაცემები დასაზუსტებელია.
                                    ნაჩვენებია მხოლოდ დადასტურებული ნაწილის
                                    ნაშთი. გასწორებამდე გადაამოწმე ეს შეკვეთები.
                                </p>
                            )}

                            {!settled && (
                                <details className="text-sm">
                                    <summary className="cursor-pointer text-text-secondary">
                                        თანხის დეტალები
                                    </summary>

                                    <dl className="mt-3 space-y-2">
                                        {[
                                            ["საკურიეროს მომსახურების საფასური", balance.courierFees],
                                            ["საკურიეროსთან მიღებული ქეში", balance.cashReceived],
                                            ["საკურიეროსთვის უკვე გადარიცხული", balance.paidToCourier],
                                            ["საკურიეროსგან უკვე მიღებული", balance.receivedFromCourier],
                                        ].map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex justify-between gap-3"
                                            >
                                                <dt className="text-text-secondary">
                                                    {label}
                                                </dt>
                                                <dd className="shrink-0 tabular-nums">
                                                    {money(value)}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </details>
                            )}

                            {!settled && (
                                <p className="text-xs text-text-secondary">
                                    მხოლოდ შეხსენებაა — რეალურ გადარიცხვას
                                    არ ასრულებს.
                                </p>
                            )}
                        </div>
                    )}

                    {notice && (
                        <p role="status" className="mt-3 text-sm text-text-secondary">
                            {notice}
                        </p>
                    )}

                    {error && (
                        <p role="alert" className="mt-3 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    {retrying && (
                        <div className="mt-3 space-y-2">
                            <p className="text-sm text-text-secondary">
                                შედეგი ჯერ ვერ დადასტურდა. იგივე მოთხოვნის
                                გადამოწმება გასწორებას მეორედ არ შეინახავს.
                            </p>
                            <button
                                type="button"
                                onClick={() => void save("SETTLE")}
                                disabled={saving}
                                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                            >
                                {saving ? "მოწმდება…" : "შენახვის შედეგის გადამოწმება"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}