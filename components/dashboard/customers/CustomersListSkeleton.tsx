export default function CustomersListSkeleton() {
    return (
        <div role="status" aria-label="მომხმარებლები იტვირთება">
            <span className="sr-only">მომხმარებლები იტვირთება</span>

            <div
                aria-hidden="true"
                className="motion-safe:animate-pulse"
            >
                <div className="flex h-12 items-center gap-4 bg-background px-3">
                    <div className="h-3 flex-1 rounded bg-border/60" />
                    <div className="h-3 flex-1 rounded bg-border/60" />
                    <div className="hidden h-3 flex-1 rounded bg-border/60 md:block" />
                    <div className="hidden h-3 flex-1 rounded bg-border/60 lg:block" />
                    <div className="w-10 shrink-0" />
                </div>

                {Array.from({ length: 6 }, (_, index) => (
                    <div
                        key={index}
                        className={
                            "flex h-16 items-center gap-4 " +
                            "border-t border-border px-3"
                        }
                    >
                        <div className="min-w-0 flex-1">
                            <div className="h-3 w-3/4 rounded bg-border/60" />
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="h-3 w-4/5 rounded bg-border/50" />
                        </div>

                        <div className="hidden min-w-0 flex-1 md:block">
                            <div className="h-3 w-8 rounded bg-border/50" />
                        </div>

                        <div className="hidden min-w-0 flex-1 lg:block">
                            <div className="h-3 w-20 rounded bg-border/50" />
                        </div>

                        <div className="h-10 w-10 shrink-0 rounded-xl bg-border/40" />
                    </div>
                ))}
            </div>
        </div>
    );
}