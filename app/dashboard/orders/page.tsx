
import NewOrderButton from "@/components/dashboard/orders/NewOrderButton";
import { Icon } from "@iconify/react";

export default function OrdersPage() {
    return (
        <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-text-primary">
                            შეკვეთები
                        </h1>

                        <p className="mt-1 text-sm text-text-secondary">
                            მართეთ ყველა შეკვეთა ერთ სივრცეში.
                        </p>
                    </div>

                    <NewOrderButton />
                </div>

                <section className="mt-6 rounded-2xl border border-border bg-surface">
                    <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-sm">
                            <Icon
                                icon="solar:magnifer-linear"
                                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                            />

                            <input
                                type="text"
                                placeholder="მოძებნე შეკვეთა..."
                                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent"
                            />
                        </div>

                        <button
                            type="button"
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-text-primary transition hover:bg-surface"
                        >
                            <Icon
                                icon="solar:filter-bold-duotone"
                                className="h-5 w-5"
                            />

                            ფილტრი
                        </button>
                    </div>

                    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                            <Icon
                                icon="solar:clipboard-list-bold-duotone"
                                className="h-7 w-7"
                            />
                        </div>

                        <h2 className="mt-4 text-base font-semibold text-text-primary">
                            შეკვეთები ჯერ არ არის
                        </h2>

                        <p className="mt-2 max-w-sm text-sm text-text-secondary">
                            შექმენი პირველი შეკვეთა და ის აქ გამოჩნდება.
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}