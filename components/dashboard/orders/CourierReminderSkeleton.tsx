export default function CourierReminderSkeleton() {
    return (
        <section
            role="status"
            aria-busy="true"
            aria-label="საკურიეროს მონაცემები იტვირთება"
            className="mt-4 rounded-2xl border border-border bg-surface p-4"
        >
            <span className="sr-only">
                საკურიეროს მონაცემები იტვირთება…
            </span>

            <div
                aria-hidden="true"
                className="flex items-start gap-3 motion-safe:animate-pulse"
            >
                <div className="size-10 shrink-0 rounded-xl bg-accent/10" />

                <div className="min-w-0 flex-1">
                    <div className="flex min-h-10 items-center justify-between gap-3">
                        <div className="h-4 w-52 max-w-[65%] rounded bg-border/50" />
                        <div className="h-10 w-10 shrink-0 rounded-xl border border-border sm:w-28" />
                    </div>

                    <div className="mt-3 h-3 w-44 max-w-full rounded bg-border/35" />
                    <div className="mt-3 h-7 w-28 rounded bg-border/55" />
                </div>
            </div>
        </section>
    );
}