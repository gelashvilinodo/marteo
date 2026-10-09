export default function OrdersListSkeleton() {
    return (
        <div role="status" aria-label="შეკვეთები იტვირთება">
            <span className="sr-only">შეკვეთები იტვირთება</span>

            <div
                aria-hidden="true"
                className="motion-safe:animate-pulse"
            >
                <div className="flex h-12 items-center gap-4 bg-background px-3 sm:px-4">
                    <div className="h-3 w-1/4 rounded bg-border/60" />
                    <div className="hidden h-3 w-1/5 rounded bg-border/60 sm:block" />
                    <div className="ml-auto h-3 w-12 rounded bg-border/60" />
                    <div className="h-3 w-16 rounded bg-border/60" />
                    <div className="w-8" />
                </div>

                {Array.from({ length: 6 }, (_, index) => (
                    <div
                        key={index}
                        className={
                            "flex h-[88px] items-center gap-3 " +
                            "border-t border-border px-3 sm:gap-4 sm:px-4"
                        }
                    >
                        <div className="hidden h-10 w-10 shrink-0 rounded-xl bg-border/50 sm:block" />

                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-3 w-16 rounded bg-border/60" />
                            <div className="h-2 w-12 rounded bg-border/40" />
                        </div>

                        <div className="hidden min-w-0 flex-1 space-y-2 sm:block">
                            <div className="h-3 w-3/4 rounded bg-border/60" />
                            <div className="h-2 w-1/2 rounded bg-border/40" />
                        </div>

                        <div className="hidden min-w-0 flex-1 space-y-2 lg:block">
                            <div className="h-3 w-3/4 rounded bg-border/60" />
                            <div className="h-2 w-1/2 rounded bg-border/40" />
                        </div>

                        <div className="h-3 w-12 shrink-0 rounded bg-border/60 sm:w-16" />
                        <div className="h-7 w-16 shrink-0 rounded-lg bg-border/40 sm:w-24" />
                        <div className="hidden h-3 w-20 shrink-0 rounded bg-border/50 xl:block" />
                        <div className="h-8 w-8 shrink-0 rounded-xl bg-border/40" />
                    </div>
                ))}
            </div>
        </div>
    );
}