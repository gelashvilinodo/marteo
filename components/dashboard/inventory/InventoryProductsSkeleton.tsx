export default function InventoryProductsSkeleton() {
    return (
        <div role="status" aria-label="პროდუქტები იტვირთება">
            <span className="sr-only">პროდუქტები იტვირთება</span>

            <div
                aria-hidden="true"
                className="motion-safe:animate-pulse"
            >
                <div className="flex h-14 items-center gap-4 bg-background px-3 sm:px-4">
                    <div className="h-3 w-2/5 rounded bg-border/60" />
                    <div className="hidden h-3 w-1/5 rounded bg-border/60 md:block" />
                    <div className="ml-auto h-3 w-12 rounded bg-border/60" />
                    <div className="h-3 w-16 rounded bg-border/60" />
                </div>

                {Array.from({ length: 6 }, (_, index) => (
                    <div
                        key={index}
                        className={
                            "flex h-[76px] items-center gap-3 " +
                            "border-t border-border px-3 sm:gap-4 sm:px-4"
                        }
                    >
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-border/50" />

                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-3 w-3/4 max-w-48 rounded bg-border/60" />
                            <div className="h-2 w-1/2 max-w-28 rounded bg-border/40" />
                        </div>

                        <div className="hidden h-3 w-20 rounded bg-border/50 md:block" />
                        <div className="hidden h-3 w-16 rounded bg-border/50 lg:block" />
                        <div className="h-3 w-7 shrink-0 rounded bg-border/60" />
                        <div className="h-6 w-16 shrink-0 rounded-lg bg-border/40 sm:w-24" />
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-border/40" />
                    </div>
                ))}
            </div>
        </div>
    );
}