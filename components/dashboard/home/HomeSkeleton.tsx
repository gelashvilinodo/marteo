function Pulse({ className = "" }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-lg bg-text-secondary/10 motion-reduce:animate-none ${className}`}
        />
    );
}

const titles = [
    "სულ გაყიდვები",
    "სუფთა მოგება",
    "სულ შეკვეთები",
    "ამჟამად მარაგში",
];

export default function HomeSkeleton() {
    return (
        <main
            role="status"
            aria-label="მთავარი გვერდი იტვირთება"
            aria-busy="true"
            className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8"
        >
            <span className="sr-only">მთავარი გვერდი იტვირთება…</span>

            <div aria-hidden="true" className="space-y-6">
                <div className="@container min-w-0">
                    <div className="flex min-w-0 flex-col gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start @min-[32rem]:justify-end">
                        <div className="order-0 w-full min-w-0 @min-[48rem]:w-auto @min-[48rem]:flex-1">
                            <Pulse className="h-8 w-32" />

                            <div className="mt-2 flex items-center gap-2">
                                <Pulse className="h-5 w-5 shrink-0" />
                                <Pulse className="h-5 w-40" />
                            </div>
                        </div>

                        <Pulse className="order-1 h-11 w-full @min-[32rem]:order-2 @min-[32rem]:w-44" />
                        <Pulse className="order-2 h-11 w-full @min-[32rem]:order-1 @min-[32rem]:w-56" />
                    </div>
                </div>

                <div className="space-y-4">
                    <Pulse className="h-4 w-56 max-w-full" />

                    <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
                        {titles.map(title => (
                            <div
                                key={title}
                                className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
                            >
                                <div className="flex flex-col items-start gap-3 2xl:flex-row 2xl:items-center">
                                    <Pulse className="h-10 w-10 shrink-0 rounded-xl" />

                                    <h2 className="min-w-0 animate-pulse break-words rounded bg-text-secondary/10 text-sm font-medium leading-relaxed text-transparent motion-reduce:animate-none">
                                        {title}
                                    </h2>
                                </div>

                                <div className="mt-4">
                                    <Pulse className="h-7 w-28 max-w-full sm:h-8" />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
                        <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Pulse className="h-6 w-52 max-w-full" />

                                <div className="flex gap-3">
                                    <Pulse className="h-4 w-16" />
                                    <Pulse className="h-4 w-20" />
                                </div>
                            </div>

                            <div className="mt-5 grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                                <div className="mt-3 flex h-56 flex-col justify-between">
                                    {Array.from({ length: 5 }, (_, index) => (
                                        <Pulse
                                            key={index}
                                            className="h-3 w-10"
                                        />
                                    ))}
                                </div>

                                <div className="min-w-0 pb-2 pt-3">
                                    <Pulse className="h-56 w-full rounded-xl" />

                                    <div className="mt-3 flex justify-between gap-2">
                                        {Array.from({ length: 5 }, (_, index) => (
                                            <Pulse
                                                key={index}
                                                className="h-3 w-7"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-border bg-background p-3">
                                <Pulse className="mb-3 h-4 w-12" />

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {[0, 1].map(index => (
                                        <div key={index}>
                                            <Pulse className="h-4 w-24" />
                                            <Pulse className="mt-1 h-5 w-28" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5">
                            <Pulse className="h-6 w-44 max-w-full" />
                            <Pulse className="mt-2 h-4 w-40" />

                            <div className="my-5 grid min-w-0 flex-1 grid-cols-2 items-center gap-3 sm:gap-5">
                                <div className="relative mx-auto aspect-square w-full max-w-64">
                                    <div className="absolute inset-[10%] animate-pulse rounded-full border-[18px] border-text-secondary/10 motion-reduce:animate-none sm:border-[24px]" />
                                </div>

                                <div className="min-w-0 space-y-4">
                                    {Array.from({ length: 4 }, (_, index) => (
                                        <div key={index}>
                                            <Pulse className="h-3 w-full max-w-32" />
                                            <Pulse className="mt-2 h-4 w-20" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Pulse className="mt-4 h-4 w-full max-w-64" />
                        </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
                        {[0, 1].map(panel => (
                            <div
                                key={panel}
                                className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface"
                            >
                                <div className="flex h-24 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
                                    <Pulse className="h-6 w-44 max-w-[60%]" />
                                    <Pulse className="h-4 w-24 max-w-[30%]" />
                                </div>

                                <div className="divide-y divide-border">
                                    {Array.from({ length: 5 }, (_, index) => (
                                        <div
                                            key={index}
                                            className="flex h-24 min-w-0 items-center gap-3 px-4 sm:px-5"
                                        >
                                            <Pulse className="h-11 w-11 shrink-0 rounded-xl" />

                                            <div className="min-w-0 flex-1">
                                                <Pulse className="h-4 w-36 max-w-full" />
                                                <Pulse className="mt-2 h-3 w-24 max-w-full" />
                                            </div>

                                            <Pulse className="h-4 w-20 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}