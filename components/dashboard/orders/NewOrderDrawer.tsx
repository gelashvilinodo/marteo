"use client";

import { Icon } from "@iconify/react";

import { useNewOrder } from "./NewOrderProvider";

export default function NewOrderDrawer() {
    const {
        isOpen,
        closeNewOrder,
    } = useNewOrder();

    return (
        <div
            className={[
                "fixed inset-0 z-[100] transition",
                isOpen
                    ? "pointer-events-auto"
                    : "pointer-events-none",
            ].join(" ")}
        >
            <button
                type="button"
                onClick={closeNewOrder}
                className={[
                    "absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity duration-300",
                    isOpen
                        ? "opacity-100"
                        : "opacity-0",
                ].join(" ")}
            />

            <aside
                className={[
                    "absolute right-0 top-0 h-screen w-full max-w-[620px] bg-background border-l border-border shadow-2xl transition-transform duration-300 ease-out",
                    isOpen
                        ? "translate-x-0"
                        : "translate-x-full",
                ].join(" ")}
            >
                <div className="flex h-full flex-col">

                    <div className="flex items-center justify-between border-b border-border px-6 py-5">

                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">
                                ახალი შეკვეთა
                            </h2>
                        </div>

                        <button
                            type="button"
                            onClick={closeNewOrder}
                            className="flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-surface"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-6 w-6"
                            />
                        </button>

                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-8">
                            <section>
                                <div className="mb-4">
                                    <h3 className="text-base font-semibold text-text-primary">
                                        კლიენტის ინფორმაცია
                                    </h3>
                                </div>

                                <div className="grid gap-4">
                                    <div>
                                        <label
                                            htmlFor="customerPhone"
                                            className="mb-2 block text-sm font-medium text-text-primary"
                                        >
                                            ტელეფონის ნომერი
                                            <span className="ml-1 text-red-500">*</span>
                                        </label>

                                        <input
                                            id="customerPhone"
                                            type="tel"
                                            placeholder="მაგ: 599 12 34 56"
                                            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent"
                                        />
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label
                                                htmlFor="customerFirstName"
                                                className="mb-2 block text-sm font-medium text-text-primary"
                                            >
                                                სახელი
                                            </label>

                                            <input
                                                id="customerFirstName"
                                                type="text"
                                                placeholder="სახელი"
                                                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                htmlFor="customerLastName"
                                                className="mb-2 block text-sm font-medium text-text-primary"
                                            >
                                                გვარი
                                            </label>

                                            <input
                                                id="customerLastName"
                                                type="text"
                                                placeholder="გვარი"
                                                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="customerAddress"
                                            className="mb-2 block text-sm font-medium text-text-primary"
                                        >
                                            მისამართი
                                        </label>

                                        <input
                                            id="customerAddress"
                                            type="text"
                                            placeholder="ქალაქი, ქუჩა, ნომერი"
                                            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                </div>
            </aside>

        </div>
    );
}