"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import { useNewOrder } from "./NewOrderProvider";

type Order = Awaited<ReturnType<typeof getOrder>>;

export default function OrderEditButton({
    orderId,
    onOpened,
}: {
    orderId: string;
    onOpened?: () => void;
}) {
    const { openEditOrder } = useNewOrder();
    const request = useRef<AbortController | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => () => request.current?.abort(), []);

    async function open() {
        if (request.current) return;

        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                `/api/orders/${encodeURIComponent(orderId)}`,
                {
                    cache: "no-store",
                    signal: controller.signal,
                },
            );

            const result = await response.json() as {
                success?: boolean;
                message?: string;
                order?: Order;
            };

            if (
                !response.ok ||
                !result.success ||
                !result.order
            ) {
                throw new Error(
                    result.message || "შეკვეთა ვერ ჩაიტვირთა.",
                );
            }

            if (controller.signal.aborted) return;

            if (!result.order.editable) {
                throw new Error(
                    "ამ შეკვეთის რედაქტირება აღარ არის შესაძლებელი. დაბრუნებისთვის ან გადაცვლისთვის გამოიყენე შესაბამისი მოქმედება.",
                );
            }

            openEditOrder(result.order);
            onOpened?.();
        } catch (cause: unknown) {
            if (!controller.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "შეკვეთა ვერ ჩაიტვირთა.",
                );
            }
        } finally {
            if (request.current === controller) {
                request.current = null;
            }

            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                onClick={() => void open()}
                disabled={loading}
                title="შეკვეთის რედაქტირება"
                aria-label={
                    loading
                        ? "შეკვეთა იტვირთება"
                        : "შეკვეთის რედაქტირება"
                }
                aria-busy={loading}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-60"
            >
                <Icon
                    icon={
                        loading
                            ? "solar:refresh-linear"
                            : "solar:pen-new-square-linear"
                    }
                    className={`h-5 w-5 ${loading ? "animate-spin" : ""
                        }`}
                />
            </button>

            {error && (
                <p
                    role="alert"
                    className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-danger/30 bg-surface p-3 text-xs text-danger shadow-lg"
                >
                    {error}
                </p>
            )}
        </div>
    );
}