"use client";

import { useEffect, useRef, useState } from "react";
import {
    OrderActionError,
    sendOrderAction,
} from "@/lib/orders/order-actions-client";

type Method = "UNKNOWN" | "CASH" | "BANK_TRANSFER" | "CARD";

export default function OrderPaymentResolution({
    orderId,
    expectedVersion,
    onResolved,
}: {
    orderId: string;
    expectedVersion: number;
    onResolved: () => Promise<void>;
}) {
    const [amount, setAmount] = useState("");
    const [paymentDate, setPaymentDate] = useState("");
    const [method, setMethod] = useState<Method>("UNKNOWN");
    const [bankName, setBankName] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    const mounted = useRef(true);
    const running = useRef(false);
    const uncertain = useRef(false);
    const request = useRef<Record<string, unknown> | null>(null);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);

    async function save() {
        if (running.current || done) return;
        if (!request.current && !confirmed) return;

        const payload = request.current ?? {
            requestId: crypto.randomUUID(),
            expectedVersion,
            paidAmount: amount.replace(",", "."),
            paymentDate: paymentDate || null,
            method,
            bankName,
            confirmHistoricalPayment: true,
        };

        request.current = payload;
        running.current = true;
        setSaving(true);
        setPending(true);
        setError("");

        const abort = new AbortController();
        controller.current = abort;

        try {
            const result = await sendOrderAction(
                orderId,
                "resolve-payment",
                payload,
                abort.signal,
            );

            if (
                result.id !== orderId ||
                result.action !== "resolve-payment" ||
                !Number.isSafeInteger(result.version) ||
                result.version < 1
            ) {
                throw new Error("შენახვის პასუხი ვერ დადასტურდა.");
            }

            if (!mounted.current || abort.signal.aborted) return;

            request.current = null;
            uncertain.current = false;
            setPending(false);
            setDone(true);

            try {
                await onResolved();
            } catch {
                if (mounted.current) {
                    setError(
                        "გადახდა დაზუსტებულია, მაგრამ გვერდი ვერ განახლდა. განაახლე გვერდი.",
                    );
                }
            }
        } catch (cause: unknown) {
            if (!mounted.current || abort.signal.aborted) return;

            const definite =
                cause instanceof OrderActionError &&
                cause.status >= 400 &&
                cause.status < 500;

            if (definite && !uncertain.current) {
                request.current = null;
                setPending(false);
                setError(cause.message);
            } else {
                uncertain.current = true;
                setError(
                    "შენახვის შედეგი დაუდასტურებელია. ხელახლა სცადე იმავე ღილაკით — იგივე მოთხოვნას გადავამოწმებთ.",
                );
            }
        } finally {
            running.current = false;

            if (controller.current === abort) {
                controller.current = null;
            }

            if (mounted.current) setSaving(false);
        }
    }

    const field =
        "min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary";

    return (
        <section className="mt-4 space-y-3 rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">
                ძველი გადახდის დაზუსტება
            </h3>

            <p className="text-sm text-text-secondary">
                მიუთითე უკვე მიღებული თანხა. ეს მოქმედება ახალ თანხას
                არ იღებს და მარაგს არ ცვლის. თუ თანხა არ მიგიღია,
                მიუთითე 0.
            </p>

            {!done && (
                <fieldset
                    disabled={saving || pending}
                    className="min-w-0 space-y-3 border-0 p-0"
                >
                    <label className="block space-y-1">
                        <span className="text-sm">უკვე მიღებული თანხა · ₾</span>
                        <input
                            inputMode="decimal"
                            value={amount}
                            onChange={event => setAmount(event.target.value)}
                            className={field}
                        />
                    </label>

                    <label className="block space-y-1">
                        <span className="text-sm">თანხის მიღების თარიღი</span>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={event => setPaymentDate(event.target.value)}
                            className={field}
                        />
                        <span className="block text-xs text-text-secondary">
                            საჭიროა დადებითი თანხისთვის. 0-ის შემთხვევაში
                            შეგიძლია ცარიელი დატოვო.
                        </span>
                    </label>

                    <label className="block space-y-1">
                        <span className="text-sm">გადახდის მეთოდი</span>
                        <select
                            value={method}
                            onChange={event => {
                                const value = event.target.value;
                                if (
                                    value === "UNKNOWN" ||
                                    value === "CASH" ||
                                    value === "BANK_TRANSFER" ||
                                    value === "CARD"
                                ) setMethod(value);
                            }}
                            className={field}
                        >
                            <option value="UNKNOWN">მეთოდი არ ვიცი</option>
                            <option value="CASH">ნაღდი</option>
                            <option value="BANK_TRANSFER">გადარიცხვა</option>
                            <option value="CARD">ბარათი</option>
                        </select>
                    </label>

                    {method === "BANK_TRANSFER" && (
                        <label className="block space-y-1">
                            <span className="text-sm">ბანკი — არასავალდებულო</span>
                            <input
                                value={bankName}
                                onChange={event => setBankName(event.target.value)}
                                className={field}
                            />
                        </label>
                    )}

                    <label className="flex items-start gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={event => setConfirmed(event.target.checked)}
                            className="mt-1 h-4 w-4"
                        />
                        ვადასტურებ, რომ ვუთითებ უკვე მიღებულ თანხას.
                    </label>
                </fieldset>
            )}

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {done ? (
                <p role="status" className="text-sm text-success">
                    გადახდა დაზუსტებულია.
                </p>
            ) : (
                <button
                    type="button"
                    disabled={saving || (!pending && !confirmed)}
                    onClick={() => void save()}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                >
                    {saving
                        ? "მოწმდება…"
                        : pending
                          ? "შენახვის ხელახლა შემოწმება"
                          : "გადახდის დაზუსტება"}
                </button>
            )}
        </section>
    );
}