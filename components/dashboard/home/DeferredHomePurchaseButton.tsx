"use client";

import {
    useEffect,
    useRef,
    useState,
    type ComponentProps,
} from "react";

import Link from "next/link";
import { useBusinessMode } from "@/components/dashboard/business/BusinessModeContext";
import type NewPurchasePanel from "@/components/dashboard/purchases/NewPurchasePanel";

type PanelComponent = typeof NewPurchasePanel;
type PanelProps = ComponentProps<PanelComponent>;

type FormOptions = Pick<
    PanelProps,
    "inventoryOptions" | "attributeOptions" | "countryOptions"
>;

type LoadedPanel = {
    Component: PanelComponent;
    options: FormOptions;
};

export default function DeferredHomePurchaseButton() {
    const mode=useBusinessMode();
    const [loaded, setLoaded] = useState<LoadedPanel | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const request = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            const controller = request.current;
            request.current = null;
            controller?.abort();
        };
    }, []);

    async function open() {
        if (request.current || loaded) return;

        const controller = new AbortController();
        request.current = controller;

        setLoading(true);
        setError("");

        const timeout = setTimeout(() => {
            controller.abort();
        }, 30000);

        try {
            const [module, options] = await Promise.all([
                import(
                    "@/components/dashboard/purchases/NewPurchasePanel"
                ),
                fetch("/api/purchases/form-options", {
                    cache: "no-store",
                    signal: controller.signal,
                }).then(async response => {
                    const result = await response.json() as {
                        success?: boolean;
                        message?: string;
                        data?: FormOptions;
                    };

                    if (
                        !response.ok ||
                        !result.success ||
                        !result.data
                    ) {
                        throw new Error(
                            result.message ||
                            "პარტიის ფორმა ვერ ჩაიტვირთა.",
                        );
                    }

                    return result.data;
                }),
            ]);

            if (
                request.current !== controller ||
                controller.signal.aborted
            ) {
                if (request.current === controller) {
                    throw new Error("ჩატვირთვის დრო ამოიწურა.");
                }

                return;
            }

            setLoaded({
                Component: module.default,
                options,
            });
        } catch (cause: unknown) {
            if (request.current !== controller) return;

            setError(
                controller.signal.aborted
                    ? "ჩატვირთვის დრო ამოიწურა. სცადე ხელახლა."
                    : cause instanceof Error
                        ? cause.message
                        : "პარტიის ფორმა ვერ ჩაიტვირთა. სცადე ხელახლა.",
            );
        } finally {
            clearTimeout(timeout);

            if (request.current === controller) {
                request.current = null;
                setLoading(false);
            }
        }
    }

    if(mode==='MANUFACTURING') return <Link href="/dashboard/material-purchases" prefetch={false} className="inline-flex h-11 items-center justify-center rounded-xl bg-success px-4 text-sm font-semibold text-white">მასალების შესყიდვა</Link>;

    if (loaded) {
        const { Component, options } = loaded;

        return (
            <Component
                inventoryOptions={options.inventoryOptions}
                attributeOptions={options.attributeOptions}
                countryOptions={options.countryOptions}
                autoOpen
            />
        );
    }

    return (
        <div className="min-w-0 space-y-2">
            <button
                type="button"
                disabled={loading}
                aria-busy={loading}
                onClick={() => void open()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white transition-colors hover:bg-success-hover disabled:cursor-wait disabled:opacity-60"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9" />
                </svg>

                {loading
                    ? "იტვირთება…"
                    : error
                        ? "ხელახლა ცდა"
                        : "ახალი პარტია"}
            </button>

            {error && (
                <p
                    role="alert"
                    className="text-xs leading-relaxed text-danger"
                >
                    {error}
                </p>
            )}
        </div>
    );
}