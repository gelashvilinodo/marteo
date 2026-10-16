function Pulse({ className = "" }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-lg bg-text-secondary/10 motion-reduce:animate-none ${className}`}
        />
    );
}

export default function PurchasesListSkeleton() {
    return (
        <div
            role="status"
            aria-label="პარტიების სია იტვირთება"
            className="mt-6 space-y-4"
        >
            <span className="sr-only">პარტიების სია იტვირთება…</span>

            <div aria-hidden="true" className="space-y-4">
                {[0, 1, 2].map(index => (
                    <div
                        key={index}
                        className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Pulse className="h-7 w-14" />
                                    <Pulse className="h-5 w-28" />
                                    <Pulse className="h-6 w-20" />
                                </div>
                                <Pulse className="mt-2 h-4 w-24" />
                            </div>

                            <div className="flex shrink-0 gap-1">
                                <Pulse className="h-11 w-11 rounded-xl" />
                                <Pulse className="h-11 w-11 rounded-xl" />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                            {[0, 1, 2].map(photo => (
                                <Pulse
                                    key={photo}
                                    className="h-12 w-12 rounded-xl sm:h-14 sm:w-14"
                                />
                            ))}
                        </div>

                        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <Pulse className="h-4 w-32" />
                            <div className="flex items-center justify-between gap-4">
                                <Pulse className="h-4 w-28" />
                                <Pulse className="h-6 w-24" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}